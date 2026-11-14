import "server-only";
import { refreshMatchDetail } from "@/lib/data";
import { getParseJob, OpenDotaError, requestParse } from "@/lib/opendota";
import { createAdminClient } from "@/lib/supabase/admin";

// Pedido de processamento do replay (v2.2). É o que gera os dados por minuto
// da linha do tempo. Cada pedido pesa como 10 chamadas no limite gratuito da
// OpenDota (60 por minuto e ~3.000 por dia para o site inteiro), por isso as
// guardas, nesta ordem: partida conhecida → já processada → já pedida →
// idade → teto por minuto → teto diário → reserva → a OpenDota já processou
// sozinha? → pedido. Os tetos vêm antes da reserva: bater num teto não gasta
// a única chance da partida.
//
// Estado em `matches` (migração 20261113000000):
//   parse_requested_at null           → nunca pedido
//   parse_requested_at + parse_job_id → em andamento
//   parse_requested_at sem job_id     → em voo (reserva há < 30 s, esperando a
//                                       OpenDota) ou resolvido (o detalhe diz
//                                       se deu certo)

export const PARSE_MAX_AGE_MS = 14 * 86_400_000; // chute: funcionou com 8,2 dias (2026-11-13)
export const PARSE_DAILY_LIMIT = 50; // pior caso 50 × (10 + 12 consultas) ≈ 1.100 chamadas
export const PARSE_MINUTE_LIMIT = 3; // 3 × 10 = metade das 60 chamadas por minuto
export const PARSE_GIVE_UP_MS = 86_400_000; // em andamento há mais de 1 dia: resolve de vez
const IN_FLIGHT_MS = 30_000; // reserva sem jobId ainda: o pedido está a caminho

export type ParseRequestStatus =
  | "requested"
  | "pending"
  | "ready"
  | "failed"
  | "too_old"
  | "limit"
  | "busy"
  | "unavailable"
  | "unknown";
export type ParseCheckStatus = "pending" | "ready" | "failed" | "unknown";

type ParseRow = {
  start_time: string;
  detail: { match?: { parsed?: boolean } } | null;
  parse_requested_at: string | null;
  parse_job_id: number | null;
};
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

const logDb = (what: string, error: { code?: string; message?: string }) =>
  console.error(`[db] ${what}: ${error.code ?? ""} ${error.message ?? ""}`);

async function readRow(admin: Admin, matchId: number): Promise<ParseRow | null> {
  const { data, error } = await admin
    .from("matches")
    .select("start_time, detail, parse_requested_at, parse_job_id")
    .eq("match_id", matchId)
    .maybeSingle<ParseRow>();
  if (error) {
    logDb("ler pedido de processamento", error);
    return null;
  }
  return data ?? null;
}

const isParsed = (row: ParseRow) => row.detail?.match?.parsed === true;
const inFlight = (row: ParseRow, nowMs: number) =>
  !row.parse_job_id && nowMs - Date.parse(row.parse_requested_at!) < IN_FLIGHT_MS;

async function setJob(admin: Admin, matchId: number, jobId: number | null): Promise<void> {
  const { error } = await admin.from("matches").update({ parse_job_id: jobId }).eq("match_id", matchId);
  if (error) logDb("gravar parse_job_id", error);
}

/** Pedidos feitos desde `sinceMs` (null = erro de leitura). */
async function countSince(admin: Admin, sinceMs: number): Promise<number | null> {
  const { count, error } = await admin
    .from("matches")
    .select("match_id", { count: "exact", head: true })
    .gte("parse_requested_at", new Date(sinceMs).toISOString());
  if (error) {
    logDb("contar pedidos de processamento", error);
    return null;
  }
  return count ?? 0;
}

/** Pede o processamento da partida, se as guardas deixarem. Nunca lança. */
export async function requestMatchParse(
  matchId: number,
  nowMs: number = Date.now(),
): Promise<ParseRequestStatus> {
  const admin = createAdminClient();
  if (!admin) return "unavailable";

  // Só partida que o site conhece (a linha existe: veio da lista de partidas
  // de algum jogador ou de uma visita): ninguém pede processamento de um ID
  // qualquer. O detalhe pode ainda não estar salvo — a página grava em
  // after() e este pedido pode chegar antes.
  const row = await readRow(admin, matchId);
  if (!row) return "unknown";
  if (isParsed(row)) return "ready";
  if (row.parse_requested_at) {
    // Outra aba pediu agora há pouco e ainda espera a OpenDota: acompanhar.
    if (row.parse_job_id || inFlight(row, nowMs)) return "pending";
    return "failed";
  }

  if (nowMs - Date.parse(row.start_time) > PARSE_MAX_AGE_MS) return "too_old";

  const lastMinute = await countSince(admin, nowMs - 60_000);
  if (lastMinute === null) return "unavailable";
  if (lastMinute >= PARSE_MINUTE_LIMIT) return "busy";
  const lastDay = await countSince(admin, nowMs - 86_400_000);
  if (lastDay === null) return "unavailable";
  if (lastDay >= PARSE_DAILY_LIMIT) return "limit";

  // Reserva: UPDATE condicional, então duas abas não pedem duas vezes.
  const { data: claimed, error: claimError } = await admin
    .from("matches")
    .update({ parse_requested_at: new Date(nowMs).toISOString() })
    .eq("match_id", matchId)
    .is("parse_requested_at", null)
    .select("match_id");
  if (claimError) {
    logDb("reservar pedido de processamento", claimError);
    return "unavailable";
  }
  if (!Array.isArray(claimed) || claimed.length === 0) return "pending";

  // A OpenDota processa partidas de profissionais sozinha, minutos depois do
  // fim: conferir custa 1 chamada e economiza as 10 do pedido.
  try {
    const fresh = await refreshMatchDetail(matchId);
    if (fresh?.parsed) return "ready";
  } catch (err) {
    console.error("[parse] conferência prévia falhou; pedindo assim mesmo:", err);
  }

  try {
    const jobId = await requestParse(matchId);
    await setJob(admin, matchId, jobId);
    return "requested";
  } catch (err) {
    if (err instanceof OpenDotaError && err.kind === "rate_limit") {
      // O 429 não gastou o pedido: devolve a chance à partida.
      const { error } = await admin
        .from("matches")
        .update({ parse_requested_at: null })
        .eq("match_id", matchId);
      if (error) logDb("desfazer reserva após 429", error);
      return "busy";
    }
    // Outras falhas: a reserva fica e a partida conta como resolvida sem
    // sucesso (não é pedida de novo; protege o limite da OpenDota).
    console.error("[parse] pedido recusado pela OpenDota:", err);
    return "unavailable";
  }
}

/**
 * Acompanha o pedido. Só chama a OpenDota para pedido em andamento; quando
 * termina, grava o detalhe novo antes de responder. Nunca lança.
 */
export async function checkMatchParse(
  matchId: number,
  nowMs: number = Date.now(),
): Promise<ParseCheckStatus> {
  const admin = createAdminClient();
  if (!admin) return "unknown";

  const row = await readRow(admin, matchId);
  if (!row || !row.parse_requested_at) return "unknown";
  if (isParsed(row)) return "ready";
  if (!row.parse_job_id) return inFlight(row, nowMs) ? "pending" : "failed";

  try {
    // Há mais de 1 dia (quem pediu fechou a aba antes de terminar): não
    // pergunta pelo pedido, busca a partida uma vez e resolve de vez.
    const giveUp = nowMs - Date.parse(row.parse_requested_at) > PARSE_GIVE_UP_MS;
    if (!giveUp && (await getParseJob(row.parse_job_id)) === "pending") return "pending";
    const match = await refreshMatchDetail(matchId);
    await setJob(admin, matchId, null);
    return match?.parsed ? "ready" : "failed";
  } catch (err) {
    // OpenDota fora do ar: tenta de novo na próxima consulta.
    console.error("[parse] consulta falhou:", err);
    return "pending";
  }
}
