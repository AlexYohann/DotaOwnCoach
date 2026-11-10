import "server-only";
import { accountIdFromClaims } from "@/lib/auth-routing";
import { createReadClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** O que o cabeçalho mostra de quem está logado. */
export type HeaderAccount = {
  accountId: number;
  name: string;
  avatar: string | null;
};

export function toHeaderAccount(
  accountId: number,
  row: { personaname: string | null; avatar: string | null } | null,
): HeaderAccount {
  return {
    accountId,
    name: row?.personaname ?? `Conta ${accountId}`,
    avatar: row?.avatar ?? null,
  };
}

/**
 * Conta logada para o cabeçalho, ou null (deslogado). Nome e avatar vêm do
 * banco (players), NUNCA da OpenDota: o cabeçalho aparece em toda página.
 * Cookie inválido (ex.: usuário apagado) conta como deslogado.
 */
export async function getHeaderAccount(): Promise<HeaderAccount | null> {
  let accountId: number | null = null;
  try {
    const { data } = await (await createClient()).auth.getClaims();
    accountId = accountIdFromClaims(data?.claims);
  } catch {
    return null;
  }
  if (accountId === null) return null;

  const { data, error } = await createReadClient()
    .from("players")
    .select("personaname, avatar")
    .eq("account_id", accountId)
    .maybeSingle<{ personaname: string | null; avatar: string | null }>();
  if (error) console.error(`[db] ler players (cabeçalho): ${error.code ?? ""} ${error.message}`);
  return toHeaderAccount(accountId, error ? null : data);
}
