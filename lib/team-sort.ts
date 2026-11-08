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
