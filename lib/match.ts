/** player_slot < 128 = Radiant; >= 128 = Dire. */
export function isWin(playerSlot: number, radiantWin: boolean): boolean {
  return playerSlot < 128 === radiantWin;
}

/**
 * Nome na tela de uma unidade extra que carrega itens (campo unitname da
 * OpenDota). Hoje só existe o urso do Lone Druid; outra unidade cai em "Unidade".
 */
export function unitLabel(unitName: string): string {
  return unitName === "spirit_bear" ? "Urso" : "Unidade";
}

/** Lado em que o jogador estava. */
export function getSide(playerSlot: number): "Radiant" | "Dire" {
  return playerSlot < 128 ? "Radiant" : "Dire";
}

// Fixo em horário de Brasília: o servidor (ex.: Vercel) roda em UTC.
const startTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** start_time (unix, segundos) -> "06/11/2026, 18:42" */
export function formatStartTime(unixSeconds: number): string {
  return formatDateTime(new Date(unixSeconds * 1000));
}

/** Date -> "06/11/2026, 18:42" (horário de Brasília) */
export function formatDateTime(date: Date): string {
  return startTimeFormat.format(date);
}

/** 2519 -> "41:59" */
export function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
