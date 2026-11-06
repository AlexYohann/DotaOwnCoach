// SteamID64 de qualquer conta individual = STEAM_ID64_BASE + account_id (32 bits).
const STEAM_ID64_BASE = BigInt("76561197960265728");
const MAX_ACCOUNT_ID = BigInt("4294967295"); // 2^32 - 1

/**
 * Converte o que o usuário digitou em account_id (o "Friend ID" de 32 bits
 * usado pela OpenDota). Aceita Friend ID ou SteamID64. Devolve null se inválido.
 */
export function toAccountId(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  // BigInt porque SteamID64 passa de Number.MAX_SAFE_INTEGER.
  let value = BigInt(trimmed);
  if (value >= STEAM_ID64_BASE) value -= STEAM_ID64_BASE;

  if (value < BigInt(1) || value > MAX_ACCOUNT_ID) return null;
  return Number(value);
}
