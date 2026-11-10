"use client";

import Image from "next/image";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { HeaderAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/client";

/** Avatar + nome no canto do cabeçalho, com o menu da conta. */
export function AccountMenu({ account }: { account: HeaderAccount }) {
  // Navegação completa, não router.push: o cache do Next guardou páginas do
  // estado logado (inclusive o redirect "/" → /player/<id> pré-carregado pelo
  // link da marca), e o push("/") voltava para as partidas. Recarregar a
  // página descarta esse cache inteiro.
  async function logout() {
    await createClient().auth.signOut();
    window.location.assign("/");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Conta: ${account.name}`}
        className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel/80 py-1 pl-1 pr-1 sm:pr-3 text-xs text-ink hover:border-muted-foreground focus:outline-none focus:ring-1 focus:ring-ember"
      >
        <Avatar account={account} />
        <span className="hidden max-w-[10rem] truncate sm:inline">{account.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-line bg-panel">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-[11px] text-muted-foreground">Conectado pela Steam</span>
          <span className="block truncate text-sm text-ink">{account.name}</span>
          <span className="block text-[11px] text-muted-foreground">{account.accountId}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem asChild>
          <Link href={`/player/${account.accountId}`}>Minhas partidas</Link>
        </DropdownMenuItem>
        {/* opções futuras entram aqui */}
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem onSelect={logout} className="text-loss focus:text-loss">
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({ account }: { account: HeaderAccount }) {
  if (account.avatar) {
    return (
      <Image
        src={account.avatar}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 rounded-full"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 items-center justify-center rounded-full bg-line text-[11px] font-semibold uppercase text-ink"
    >
      {account.name.charAt(0)}
    </span>
  );
}
