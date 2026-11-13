// Regras puras dos pro players (v2.1). Sem servidor: o componente de busca
// também usa este arquivo.

/** Uma linha do dropdown da busca. */
export type ProSuggestion = {
  accountId: number;
  name: string; // nick de pro (não o nome da Steam)
  avatar: string | null; // avatar da Steam
  teamName: string | null;
  teamTag: string | null;
  teamLogo: string | null;
  lastMatchTime: string | null; // ISO
  verified: boolean; // "is_locked" da OpenDota
};

export type ProSearchResult = {
  verified: ProSuggestion[];
  others: ProSuggestion[];
};

export type TeamLike = {
  team_id: number;
  rating: number;
  last_match_time: number | null; // segundos Unix
};

export type MemberLike = {
  account_id: number;
  name: string | null;
  games_played: number;
  is_current_team_member: boolean | null;
};

export const FEATURED_TEAMS = 6;
const ACTIVE_DAYS = 60;
const MIN_QUERY = 2;
const MAX_QUERY = 32;
const DAY_MS = 86_400_000;

/**
 * Nick comparável: minúsculas, sem acento, só letras e números de QUALQUER
 * alfabeto ("Miracle-" → "miracle", "天鸽" continua "天鸽"). Restringir a a-z
 * apagaria os nicks chineses, japoneses e russos.
 */
export function normalizeNick(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Texto da busca pronto para o banco, ou null = não buscar (curto demais,
 * longo demais, só símbolos). O resultado só tem letras e números, então
 * nunca carrega curingas de SQL (% e _).
 */
export function cleanQuery(raw: string | null): string | null {
  if (raw === null || raw.length > MAX_QUERY) return null;
  const q = normalizeNick(raw);
  return q.length >= MIN_QUERY ? q : null;
}

/** Os 6 times de maior rating entre os que jogaram nos últimos 60 dias. */
export function featuredTeams<T extends TeamLike>(teams: T[], nowMs: number): T[] {
  const cutoff = nowMs / 1000 - ACTIVE_DAYS * 86_400;
  return teams
    .filter((t) => t.last_match_time !== null && t.last_match_time >= cutoff)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, FEATURED_TEAMS);
}

/** Elenco atual inteiro (a OpenDota não diz quem é reserva), por partidas pelo time. */
export function currentRoster(
  members: MemberLike[],
): { account_id: number; name: string }[] {
  return members
    .filter((m) => m.is_current_team_member === true && !!m.name?.trim())
    .sort((a, b) => b.games_played - a.games_played)
    .map((m) => ({ account_id: m.account_id, name: m.name!.trim() }));
}

/** Sorteia um candidato; `random` devolve [0, 1) como Math.random. */
export function pickExample(
  candidates: number[],
  random: () => number,
): number | null {
  if (candidates.length === 0) return null;
  const i = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[i];
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", // mesmo fuso das datas do site (lib/match.ts)
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
// Dia de calendário em São Paulo, como número de dias desde 1970.
const dayNumber = (ms: number) => Date.parse(DAY_FORMAT.format(ms)) / DAY_MS;

/** "jogou há X" a partir da última partida conhecida. */
export function lastPlayedLabel(iso: string | null, nowMs: number): string {
  const then = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(then)) return "sem partidas recentes";
  const days = Math.max(0, dayNumber(nowMs) - dayNumber(then));
  if (days === 0) return "jogou hoje";
  if (days === 1) return "jogou ontem";
  if (days < 30) return `jogou há ${days} dias`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `jogou há ${months} ${months === 1 ? "mês" : "meses"}`;
  }
  return "jogou há mais de um ano";
}

/** Brasão só se for https (http daria aviso de conteúdo misto; outros esquemas, nunca). */
export function safeLogoUrl(url: string | null | undefined): string | null {
  return url && url.startsWith("https://") ? url : null;
}

/**
 * Para onde o Enter leva: sugestão escolhida com as setas; senão, só dígitos =
 * busca por ID (como antes da v2.1); senão, a primeira sugestão. null = nada.
 */
export function submitTarget(
  value: string,
  highlighted: ProSuggestion | null,
  first: ProSuggestion | null,
): string | null {
  if (highlighted) return `/player/${highlighted.accountId}`;
  const text = value.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return `/player/${text}`;
  return first ? `/player/${first.accountId}` : null;
}
