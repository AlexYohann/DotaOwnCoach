// Regras de rota (usadas pelo proxy.ts e pelo cabeçalho). Puro: sem servidor.

const MAX_ACCOUNT_ID = 4294967295; // 2^32 - 1
// Rotas abertas sem login: "/" exato e estes prefixos (por segmento:
// "/player/1" sim, "/players-falso" não).
const PUBLIC_PREFIXES = ["/auth", "/player", "/match"];

/**
 * account_id da conta Steam, vindo das claims do JWT. Só app_metadata
 * (gravado pelo servidor no login) conta; user_metadata o próprio usuário
 * edita, então é ignorado.
 */
export function accountIdFromClaims(claims: unknown): number | null {
  if (!claims || typeof claims !== "object") return null;
  const meta = (claims as { app_metadata?: unknown }).app_metadata;
  if (!meta || typeof meta !== "object") return null;
  const id = (meta as { account_id?: unknown }).account_id;
  if (typeof id !== "number" || !Number.isInteger(id)) return null;
  return id >= 1 && id <= MAX_ACCOUNT_ID ? id : null;
}

/** Para onde redirecionar (ou null = deixa passar). */
export function routeFor(
  pathname: string,
  loggedIn: boolean,
  accountId: number | null,
): string | null {
  if (pathname === "/") {
    return loggedIn && accountId !== null ? `/player/${accountId}` : null;
  }
  if (loggedIn) return null;
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  return isPublic ? null : "/";
}
