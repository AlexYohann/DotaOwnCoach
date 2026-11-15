// "Quem joga comigo" (v2.3): regras puras dos parceiros de um jogador.
// Sem server-only: o componente da página (cliente) também usa.

/** Uma pessoa que já esteve em partidas com o jogador (de /players/{id}/peers). */
export type Peer = {
  account_id: number;
  name: string | null;
  avatar: string | null; // só https
  with_games: number; // mesmo time
  with_win: number;
  against_games: number; // times opostos; vitória = do jogador consultado
  against_win: number;
  last_played: number; // unix (s): última partida em comum, juntos ou contra
};

/** Linha de player_peers. */
export type PeersRow = {
  peers: Peer[] | null;
  fetched_at: string | null;
  refresh_started_at: string | null;
  refresh_failed_at: string | null;
};

/**
 * ready = lista com menos de 12 h; refreshing = renovação em andamento;
 * failed = a OpenDota falhou há pouco (não insiste); start = pode pedir.
 */
export type PeersState = "ready" | "refreshing" | "failed" | "start";

/** O que a página e a rota entregam à seção. unknown = conta ainda não está em players. */
export type PeersSnapshot = {
  state: PeersState | "unknown";
  peers: Peer[] | null;
  fetchedAt: string | null;
};

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export const PEERS_MIN_GAMES = 3; // 1–2 juntos costuma ser desconhecido no mesmo time
export const PEERS_MAX = 60;
export const PEERS_RECENT_DAYS = 90;
export const PEERS_TTL_MS = 12 * 60 * MIN; // parceiros mudam devagar
export const PEERS_RUNNING_MS = 2 * MIN; // tempo máximo da chamada (60 s) + folga
export const PEERS_RETRY_MS = 10 * MIN; // OpenDota falhou: espera antes de tentar de novo
// Lista vazia depois de uma cheia: defeito da OpenDota, ou a conta fechou o
// perfil ("Expor dados públicos" desligado). Até 7 dias, mantém a cheia; depois, aceita.
export const PEERS_KEEP_ON_EMPTY_MS = 7 * DAY;
// Teto do site inteiro (função claim_peers_refresh). OpenDota grátis: ~60/min e
// ~3.000/dia, divididos com o resto do site (a análise de replay usa até 30/min e 500/dia).
export const PEERS_PER_MINUTE = 5;
export const PEERS_PER_DAY = 300;

/** Só quem tem 3+ partidas juntos; mais partidas primeiro (empate: mais recente); no máximo 60. */
export function selectPeers(raw: Peer[]): Peer[] {
  return raw
    .filter((p) => p.with_games >= PEERS_MIN_GAMES)
    .sort((a, b) => b.with_games - a.with_games || b.last_played - a.last_played)
    .slice(0, PEERS_MAX);
}

/** Recentes (última partida em comum nos últimos 90 dias) e antigos, mantendo a ordem. */
export function splitPeers(peers: Peer[], nowMs: number): { recent: Peer[]; old: Peer[] } {
  const cutoff = nowMs - PEERS_RECENT_DAYS * DAY;
  const recent: Peer[] = [];
  const old: Peer[] = [];
  for (const p of peers) (p.last_played * 1000 >= cutoff ? recent : old).push(p);
  return { recent, old };
}

// Há quanto tempo (ms); null se ausente ou inválido.
function age(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : nowMs - t;
}

/** A mesma regra da função SQL claim_peers_refresh (migração v2.3): start = pode reservar. */
export function peersState(row: PeersRow | null, nowMs: number): PeersState {
  if (!row) return "start";
  const fetched = age(row.fetched_at, nowMs);
  if (fetched !== null && fetched < PEERS_TTL_MS) return "ready";
  const started = age(row.refresh_started_at, nowMs);
  if (started !== null && started < PEERS_RUNNING_MS) return "refreshing";
  const failed = age(row.refresh_failed_at, nowMs);
  if (failed !== null && failed < PEERS_RETRY_MS) return "failed";
  return "start";
}

/** Porcentagem inteira de vitórias; null sem partidas. */
export function winPercent(win: number, games: number): number | null {
  return games > 0 ? Math.round((win / games) * 100) : null;
}
