import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { Button } from "@/components/ui/button";
import { getHeaderAccount } from "@/lib/account";

/**
 * Canto direito do cabeçalho: "Entrar com a Steam" ou o menu da conta.
 * Lê o cookie de sessão → fica em Suspense (cacheComponents), com um
 * marcador do mesmo tamanho para o layout não pular.
 */
export function HeaderAccountSlot() {
  return (
    <Suspense fallback={<div aria-hidden className="h-8 w-8 shrink-0 sm:w-36" />}>
      <AccountArea />
    </Suspense>
  );
}

async function AccountArea() {
  const account = await getHeaderAccount();
  if (account) return <AccountMenu account={account} />;
  return (
    <Button asChild size="sm" className="h-8 shrink-0 px-3 text-xs">
      {/* <a>, não <Link>: a rota redireciona para fora (Steam), nada de prefetch */}
      <a href="/auth/steam">Entrar com a Steam</a>
    </Button>
  );
}
