/** player_slot < 128 = Radiant; >= 128 = Dire. */
export function isWin(playerSlot: number, radiantWin: boolean): boolean {
  return playerSlot < 128 === radiantWin;
}

/** 2519 -> "41:59" */
export function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
