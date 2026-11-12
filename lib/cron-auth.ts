import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const sha256 = (text: string) => createHash("sha256").update(text).digest();

/**
 * Confere o cabeçalho Authorization do cron da Vercel ("Bearer <CRON_SECRET>").
 * Compara os hashes em tempo constante: tamanhos diferentes não lançam nem
 * revelam nada pelo tempo de resposta. Sem segredo configurado, nunca autoriza.
 */
export function isCronAuthorized(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;
  return timingSafeEqual(sha256(header), sha256(`Bearer ${secret}`));
}
