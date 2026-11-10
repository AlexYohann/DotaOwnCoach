import Link from "next/link";
import { HeaderSearch } from "@/components/header-search";

/**
 * Barra do topo: marca · link da página (right) · busca · conta.
 * No celular a busca desce para uma linha própria, inteira.
 * `account` é obrigatório (HeaderAccountSlot) para nenhuma página esquecer.
 * v2.1/depois: "Pro players" e o seletor de idioma entram no grupo do `right`.
 */
export function SiteHeader({
  right,
  account,
}: {
  right?: React.ReactNode;
  account: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <Link
        href="/"
        className="shrink-0 whitespace-nowrap font-display text-lg font-bold uppercase tracking-wide text-ink"
      >
        Dota <span className="text-ember">Own</span> Coach
      </Link>
      <div className="ml-auto flex min-w-0 items-center gap-4 whitespace-nowrap">{right}</div>
      <div className="order-last basis-full sm:order-none sm:basis-auto">
        <HeaderSearch />
      </div>
      {account}
    </div>
  );
}
