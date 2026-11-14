import "server-only";
import { refreshMatchDetail } from "@/lib/data";
import { getParseJob, requestParse } from "@/lib/opendota";
import { createAdminClient } from "@/lib/supabase/admin";

// Pedido de processamento do replay (v2.2). É o que gera os dados por minuto
// da linha do tempo. Cada pedido pesa como 10 chamadas no limite gratuito da
// OpenDota (~3.000 por dia para o site inteiro), por isso as guardas, nesta
// ordem: partida conhecida → já processada → já pedida → idade → teto diário
// → reserva → pedido. O teto vem antes da reserva: bater no teto não gasta a
// única chance da partida.
//
// Estado em `matches` (migração 20261113000000):
//   parse_requested_at null           → nunca pedido
//   parse_requested_at + parse_job_id → em andamento
//   parse_requested_at sem job_id     → resolvido (o detalhe diz se deu certo)

export const PARSE_MAX_AGE_MS = 14 * 86_400_000; // chute: funcionou com 8,2 dias (2026-11-13)
export const PARSE_DAILY_LIMIT = 50; // pior caso 50 × (10 + 12 consultas) ≈ 1.100 chamadas
export const PARSE_GIVE_UP_MS = 86_400_000; // em andamento há mais de 1 dia = não deu certo

export type ParseRequestStatus =
  | "requested"
  | "pending"
  | "ready"
  | "failed"
  | "too_old"
  | "limit"
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

async function setJob(admin: Admin, matchId: number, jobId: number | null): Promise<void> {
  const { error } = await admin.from("matches").update({ parse_job_id: jobId }).eq("match_id", matchId);
  if (error) logDb("gravar parse_job_id", error);
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
  if (row.parse_requested_at) return row.parse_job_id ? "pending" : "failed";

  if (nowMs - Date.parse(row.start_time) > PARSE_MAX_AGE_MS) return "too_old";

  const { count, error: countError } = await admin
    .from("matches")
    .select("match_id", { count: "exact", head: true })
    .gte("parse_requested_at", new Date(nowMs - 86_400_000).toISOString());
  if (countError) {
    logDb("contar pedidos de processamento", countError);
    return "unavailable";
  }
  if ((count ?? 0) >= PARSE_DAILY_LIMIT) return "limit";

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

  try {
    const jobId = await requestParse(matchId);
    await setJob(admin, matchId, jobId);
    return "requested";
  } catch (err) {
    // A reserva fica: a partida conta como resolvida sem sucesso e não é
    // pedida de novo (protege o limite da OpenDota).
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
  if (!row.parse_job_id) return "failed";

  if (nowMs - Date.parse(row.parse_requested_at) > PARSE_GIVE_UP_MS) {
    await setJob(admin, matchId, null);
    return "failed";
  }

  try {
    if ((await getParseJob(row.parse_job_id)) === "pending") return "pending";
    const match = await refreshMatchDetail(matchId);
    await setJob(admin, matchId, null);
    return match?.parsed ? "ready" : "failed";
  } catch (err) {
    // OpenDota fora do ar: tenta de novo na próxima consulta.
    console.error("[parse] consulta falhou:", err);
    return "pending";
  }
}
