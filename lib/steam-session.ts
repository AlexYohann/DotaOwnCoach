import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toAccountId } from "@/lib/steam";

// Sessão do Supabase para quem entrou com a Steam (testado no protótipo de
// 2026-11-10). O usuário existe no Supabase com um e-mail interno, sem senha;
// o provedor de e-mail e o cadastro público ficam desligados no painel, então
// a única porta de entrada é /auth/steam/callback.

/** Domínio reservado (RFC 2606): ninguém recebe e-mail nele. */
export const STEAM_EMAIL_DOMAIN = "steam.invalid";

export function steamEmail(steamId64: string): string {
  return `${steamId64}@${STEAM_EMAIL_DOMAIN}`;
}

/**
 * Garante o usuário e a linha em profiles, e devolve o token de uso único
 * que o callback troca pela sessão (verifyOtp). `admin` precisa ser o
 * cliente com a secret key. Lança em qualquer falha.
 */
export async function prepareSteamSession(
  admin: SupabaseClient,
  steamId64: string,
): Promise<{ userId: string; accountId: number; tokenHash: string }> {
  const accountId = toAccountId(steamId64);
  if (accountId === null) throw new Error(`SteamID64 inválido: ${steamId64}`);
  const email = steamEmail(steamId64);

  // account_id em app_metadata (só o servidor altera) → vai para o JWT.
  // Nunca em user_metadata: o próprio usuário consegue editar.
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { steam_id64: steamId64, account_id: accountId },
  });
  if (created.error && created.error.code !== "email_exists") {
    throw new Error(`createUser: ${created.error.code} ${created.error.message}`);
  }

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  const userId = link.data?.user?.id;
  if (link.error || !tokenHash || !userId) {
    throw new Error(`generateLink: ${link.error?.message ?? "sem token"}`);
  }

  const { error } = await admin.from("profiles").upsert({
    id: userId,
    account_id: accountId,
    steam_id64: steamId64,
    last_login: new Date().toISOString(),
  });
  if (error) throw new Error(`profiles: ${error.code} ${error.message}`);

  return { userId, accountId, tokenHash };
}
