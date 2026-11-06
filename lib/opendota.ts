import "server-only";

const BASE_URL = "https://api.opendota.com/api";
const TIMEOUT_MS = 8000;

export type PlayerProfile = {
  account_id: number;
  personaname: string | null;
  avatarmedium: string | null;
  profileurl: string | null;
};

export type RecentMatch = {
  match_id: number;
  player_slot: number;
  radiant_win: boolean | null;
  hero_id: number;
  start_time: number;
  duration: number;
  kills: number;
  deaths: number;
  assists: number;
  gold_per_min: number;
  xp_per_min: number;
  last_hits: number;
};

export type OpenDotaErrorKind = "rate_limit" | "unavailable";

export class OpenDotaError extends Error {
  constructor(
    public kind: OpenDotaErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "OpenDotaError";
  }
}

/** Devolve o JSON, ou null em 404. Lança OpenDotaError nos demais problemas. */
async function request<T>(path: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    // Erro de rede ou timeout.
    throw new OpenDotaError("unavailable", `Falha ao chamar ${path}: ${err}`);
  }

  if (res.status === 404) return null;
  if (res.status === 429) {
    throw new OpenDotaError("rate_limit", `429 em ${path}`);
  }
  if (!res.ok) {
    throw new OpenDotaError("unavailable", `HTTP ${res.status} em ${path}`);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new OpenDotaError("unavailable", `JSON inválido em ${path}`);
  }
}

/** null = jogador não existe na OpenDota. */
export async function getPlayer(
  accountId: number,
): Promise<PlayerProfile | null> {
  const data = await request<{ profile?: PlayerProfile }>(
    `/players/${accountId}`,
  );
  return data?.profile ?? null;
}

export async function getRecentMatches(
  accountId: number,
): Promise<RecentMatch[]> {
  const data = await request<RecentMatch[]>(
    `/players/${accountId}/recentMatches`,
  );
  return Array.isArray(data) ? data.slice(0, 20) : [];
}
