import { cn } from "@/lib/utils";

/** "Vitória" (verde) / "Derrota" (vermelho) / "—" (indefinido). */
export function ResultText({
  win,
  className,
}: {
  win: boolean | null;
  className?: string;
}) {
  if (win === null) return <span className={className}>—</span>;
  return (
    <span className={cn(win ? "text-win" : "text-loss", className)}>
      {win ? "Vitória" : "Derrota"}
    </span>
  );
}

/** Lado do jogador: sempre texto neutro (não confundir com vitória/derrota). */
export function SideText({
  side,
  className,
}: {
  side: "Radiant" | "Dire";
  className?: string;
}) {
  return <span className={cn("text-side", className)}>{side}</span>;
}
