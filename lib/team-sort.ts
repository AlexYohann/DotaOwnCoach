// Ordenação das tabelas de times na tela da partida (v1.4).

export type SortKey =
  | "level"
  | "kills"
  | "lastHits"
  | "gpm"
  | "netWorth"
  | "heroDamage"
  | "towerDamage";

export type SortState = { key: SortKey; dir: "desc" | "asc" } | null;

/** Clique no cabeçalho: maior primeiro → menor primeiro → ordem original. */
export function nextSort(current: SortState, clicked: SortKey): SortState {
  if (!current || current.key !== clicked) return { key: clicked, dir: "desc" };
  return current.dir === "desc" ? { key: clicked, dir: "asc" } : null;
}

/** Nova lista ordenada (estável); valores null sempre no fim. */
export function sortPlayers<T extends Record<SortKey, number | null>>(
  players: T[],
  state: SortState,
): T[] {
  if (!state) return [...players];
  const { key, dir } = state;
  const sign = dir === "desc" ? -1 : 1;
  return [...players].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * sign;
  });
}

/** Soma do campo no time, ignorando ausentes; null se ninguém tem o valor. */
export function teamTotal<T extends Record<SortKey, number | null>>(
  players: T[],
  key: SortKey,
): number | null {
  const values = players.map((p) => p[key]).filter((v): v is number => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}

export type TeamMode = "full" | "compact";

/**
 * Ordenação que vale no modo atual. No "Lado a lado" só a coluna K/D/A
 * existe: ordenar por uma coluna escondida mudaria a ordem sem indicador.
 */
export function visibleSort(mode: TeamMode, sort: SortState): SortState {
  if (mode === "compact" && sort && sort.key !== "kills") return null;
  return sort;
}

// Preferência do modo, guardada no navegador.
const MODE_KEY = "dota-own-coach:team-mode";
type ModeStorage = Pick<Storage, "getItem" | "setItem">;

/** Lê o modo salvo; armazenamento bloqueado (navegação privada) → "full". */
export function readTeamMode(storage: ModeStorage | null): TeamMode {
  try {
    const v = storage?.getItem(MODE_KEY);
    return v === "compact" ? "compact" : "full";
  } catch {
    return "full";
  }
}

/** Salva o modo; se o navegador bloquear, só não lembra (nunca lança). */
export function saveTeamMode(storage: ModeStorage | null, mode: TeamMode): void {
  try {
    storage?.setItem(MODE_KEY, mode);
  } catch {
    // sem armazenamento: a escolha vale só nesta visita
  }
}
