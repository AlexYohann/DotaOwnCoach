import "server-only";
import { createClient } from "@supabase/supabase-js";

// Clientes sem sessão/cookies, só para o servidor. Um novo por chamada
// (regra do template: nunca guardar cliente em variável de módulo).

/**
 * Leitura com a chave PÚBLICA: passa pelo RLS como um visitante qualquer,
 * então só enxerga o que as políticas de leitura liberam.
 */
export function createReadClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Escrita com a SECRET KEY: ignora o RLS. Por isso este arquivo é
 * "server-only" e a variável não tem prefixo NEXT_PUBLIC_.
 * Devolve null se a chave não estiver configurada (o site segue funcionando,
 * só não grava no banco).
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
