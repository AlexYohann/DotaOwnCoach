import "server-only";
import { getPeers } from "@/lib/opendota";
import {
  peersState,
  PEERS_KEEP_ON_EMPTY_MS,
  PEERS_PER_DAY,
  PEERS_PER_MINUTE,
  PEERS_RETRY_MS,
  PEERS_RUNNING_MS,
  PEERS_TTL_MS,
  selectPeers,
  type Peer,
  type PeersRow,
  type PeersSnapshot,
} from "@/lib/peers";
import { createAdminClient, createReadClient } from "@/lib/supabase/admin";

// "Quem joga comigo" (v2.3). /players/{id}/peers é lento (~45 s) e instável,
// então a lista mora em player_peers e é renovada em segundo plano. A página
// só LÊ (getPeersSnapshot); quem renova é a rota /player/[id]/peers, dentro
// de after() (refreshPeers).

const logDb = (what: string, error: { code?: string; message?: string }) =>
  console.error(`[db] ${what}: ${error.code ?? ""} ${error.message ?? ""}`);

const NOTHING: PeersSnapshot = { state: "start", peers: null, fetchedAt: null };

/** Estado e lista guardada. Nunca lança: erro do banco = start sem lista. */
export async function getPeersSnapshot(
  accountId: number,
  nowMs = Date.now(),
): Promise<PeersSnapshot> {
  // Uma consulta: players (a conta existe?) com player_peers embutido.
  const { data, error } = await createReadClient()
    .from("players")
    .select("account_id, player_peers(peers, fetched_at, refresh_started_at, refresh_failed_at)")
    .eq("account_id", accountId)
    .maybeSingle<{ account_id: number; player_peers: PeersRow | PeersRow[] | null }>();
  if (error) {
    logDb("ler player_peers", error);
    return NOTHING;
  }
  if (!data) return { state: "unknown", peers: null, fetchedAt: null };
  // Relação 1:1 (a chave é a mesma): o PostgREST manda objeto; lista por garantia.
  const embedded = data.player_peers;
  const row = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
  return {
    state: peersState(row, nowMs),
    peers: Array.isArray(row?.peers) ? row.peers : null,
    fetchedAt: row?.fetched_at ?? null,
  };
}

/**
 * Renova a lista de uma conta. Só UMA renovação por conta de cada vez e no
 * máximo 5/min e 300/dia no site inteiro (reserva atômica no banco); falha da
 * OpenDota fica marcada e bloqueia novas tentativas por 10 min. Nunca lança.
 */
export async function refreshPeers(accountId: number): Promise<"saved" | "busy" | "failed"> {
  const admin = createAdminClient();
  if (!admin) {
    // Sem como gravar, cada pergunta da tela faria uma chamada de ~45 s.
    console.warn("[db] SUPABASE_SECRET_KEY ausente: parceiros não são buscados");
    return "failed";
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_peers_refresh", {
    p_account_id: accountId,
    p_ttl_s: PEERS_TTL_MS / 1000,
    p_running_s: PEERS_RUNNING_MS / 1000,
    p_retry_s: PEERS_RETRY_MS / 1000,
    p_per_minute: PEERS_PER_MINUTE,
    p_per_day: PEERS_PER_DAY,
  });
  if (claimError) {
    logDb("reservar renovação de parceiros", claimError);
    return "failed";
  }
  if (claimed !== true) return "busy";

  const now = () => new Date().toISOString();
  const markFailed = async () => {
    const { error } = await admin
      .from("player_peers")
      .update({ refresh_failed_at: now(), refresh_started_at: null })
      .eq("account_id", accountId);
    if (error) logDb("marcar falha de parceiros", error);
  };

  let peers: Peer[];
  try {
    peers = selectPeers(await getPeers(accountId));
  } catch (err) {
    console.warn(`[peers] OpenDota falhou para ${accountId}: ${err}`);
    await markFailed();
    return "failed";
  }

  // Lista vazia por cima de uma lista boa: partidas juntos só aumentam, então
  // é defeito da OpenDota ou perfil fechado. Mantém a boa por até 7 dias; na
  // dúvida (erro ao ler a salva), não apaga nada.
  if (peers.length === 0) {
    const { data: saved, error: readError } = await admin
      .from("player_peers")
      .select("peers, fetched_at")
      .eq("account_id", accountId)
      .maybeSingle<{ peers: Peer[] | null; fetched_at: string | null }>();
    if (readError) {
      logDb("ler player_peers salva", readError);
      await markFailed();
      return "failed";
    }
    const savedAt = saved?.fetched_at ? Date.parse(saved.fetched_at) : NaN;
    const recentEnough = !(Date.now() - savedAt >= PEERS_KEEP_ON_EMPTY_MS); // data inválida = recente
    if (Array.isArray(saved?.peers) && saved.peers.length > 0 && recentEnough) {
      console.warn(`[peers] lista vazia para ${accountId}; mantendo a salva`);
      await markFailed();
      return "failed";
    }
  }

  const { error } = await admin
    .from("player_peers")
    .update({ peers, fetched_at: now(), refresh_started_at: null, refresh_failed_at: null })
    .eq("account_id", accountId);
  if (error) {
    logDb("gravar player_peers", error);
    return "failed";
  }
  return "saved";
}
