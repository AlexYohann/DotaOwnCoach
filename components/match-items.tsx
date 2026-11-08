"use client";

import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Item } from "@/lib/opendota"; // só o tipo: some no bundle do cliente

// Ícones de itens com preview no hover/foco (movidos de match-view.tsx na v1.4).
// Precisa de um <TooltipProvider> acima (o MatchView fornece).

// Dados já resolvidos no servidor (nome/imagem de itens), para não mandar a
// lista inteira de itens para o navegador. img null = item que a lista da
// OpenDota não conhece.
export type ViewItem = Omit<Item, "img"> & { img: string | null };

// Tamanhos dos ícones (proporção 88×64 da imagem de item).
const SIZES = {
  md: { w: 33, h: 24, box: "w-[33px] h-6" },
  sm: { w: 27, h: 20, box: "w-[27px] h-5" }, // tabela completa
  xs: { w: 21, h: 15, box: "w-[21px] h-[15px]" }, // mochila na tabela completa
} as const;
export type ItemSize = keyof typeof SIZES;

/** Ícones compactos (tabela). */
export function ItemRow({
  items,
  size = "md",
}: {
  items: (ViewItem | null)[];
  size?: ItemSize;
}) {
  return (
    <span className="flex shrink-0 gap-1">
      {items.map((it, i) =>
        it ? (
          <ItemIcon key={i} item={it} size={size} />
        ) : (
          <span key={i} className={`${SIZES[size].box} shrink-0 rounded-sm bg-muted`} />
        ),
      )}
    </span>
  );
}

/** Ícones com nome (painel do herói selecionado). */
export function ItemList({
  label,
  items,
}: {
  label: string;
  items: (ViewItem | null)[];
}) {
  const filled = items.filter((it): it is ViewItem => it !== null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground w-16">{label}</span>
      {filled.length === 0 && <span className="text-muted-foreground">—</span>}
      {filled.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          <ItemIcon item={it} />
          <span>{it.name}</span>
        </span>
      ))}
    </div>
  );
}

/** Ícone do item com preview (o que ele faz) ao passar o mouse ou focar. */
export function ItemIcon({ item, size = "md" }: { item: ViewItem; size?: ItemSize }) {
  const sz = SIZES[size];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* button = o preview também abre pelo teclado (Tab) */}
        <button
          type="button"
          aria-label={item.name}
          className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {item.img ? (
            <Image
              src={item.img}
              alt={item.name}
              width={sz.w}
              height={sz.h}
              className="rounded-sm"
            />
          ) : (
            <span className={`${sz.box} rounded-sm bg-muted text-[9px] flex items-center justify-center`}>
              #{item.id}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-xs">
        <ItemPreview item={item} />
      </TooltipContent>
    </Tooltip>
  );
}

const ABILITY_TYPE: Record<string, string> = {
  active: "Ativa",
  passive: "Passiva",
  use: "Uso",
  toggle: "Alternável",
};

function ItemPreview({ item }: { item: ViewItem }) {
  const footer = [
    item.cooldown !== null && `Recarga ${item.cooldown}s`,
    item.manaCost !== null && `Mana ${item.manaCost}`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2 py-1 text-left">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold text-sm">{item.name}</span>
        {item.cost !== null && (
          <span className="opacity-80">
            {item.cost.toLocaleString("pt-BR")} de ouro
          </span>
        )}
      </div>
      {item.stats.length > 0 && (
        <ul>
          {item.stats.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {item.abilities.map((a) => (
        <div key={a.title}>
          <p className="font-semibold">
            {ABILITY_TYPE[a.type] ?? a.type}: {a.title}
          </p>
          {/* descrições vêm com \n — pre-line respeita as quebras */}
          <p className="whitespace-pre-line opacity-90">{a.description}</p>
        </div>
      ))}
      {footer.length > 0 && <p className="opacity-80">{footer.join(" · ")}</p>}
    </div>
  );
}
