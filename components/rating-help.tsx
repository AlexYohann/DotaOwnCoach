"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * "?" ao lado de "Times em destaque": explica o rating. Popover (clique ou
 * toque), não tooltip — tooltip não abre no celular. Fecha tocando fora ou Esc.
 */
export function RatingHelp() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Como funciona o rating"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[11px] font-semibold leading-none text-muted-foreground transition-colors hover:border-ember hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ember"
      >
        ?
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-80 max-w-[calc(100vw-1.5rem)] border-line bg-panel text-xs leading-relaxed text-muted-foreground"
      >
        <strong className="text-ink">Rating</strong> — pontuação calculada pela
        OpenDota no sistema Elo, o mesmo do xadrez. Todo time começa em 1000. A
        cada partida entre dois times registrados, o vencedor ganha pontos e o
        perdedor perde os mesmos pontos; vencer um time mais forte vale mais.
        Não é um ranking oficial da Valve.
      </PopoverContent>
    </Popover>
  );
}
