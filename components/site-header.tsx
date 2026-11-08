import Link from "next/link";

/** Barra do topo: marca à esquerda, ação da página à direita. */
export function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
      <Link
        href="/"
        className="font-display text-lg font-bold uppercase tracking-wide text-ink"
      >
        Dota <span className="text-ember">Own</span> Coach
      </Link>
      {right}
    </div>
  );
}
