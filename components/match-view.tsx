"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { HeroCell } from "@/components/hero-cell";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Item } from "@/lib/opendota"; // só o tipo: some no bundle do cliente
import { cn } from "@/lib/utils";

// Dados já resolvidos no servidor (nome/imagem de herói e itens), para não
// mandar as listas inteiras de heróis/itens para o navegador.
// img null = item que a lista da OpenDota não conhece.
export type ViewItem = Omit<Item, "img"> & { img: string | null };

export type ViewPlayer = {
  slot: number;
  isRadiant: boolean;
  isSearched: boolean; // o jogador que veio do histórico (?player=)
  playerName: string;
  heroId: number;
  hero: { name: string; img: string } | null;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  denies: number;
  gpm: number;
  xpm: number;
  netWorth: number | null;
  heroDamage: number | null;
  towerDamage: number | null;
  heroHealing: number | null;
  items: (ViewItem | null)[];
  backpack: (ViewItem | null)[];
  neutral: (ViewItem | null)[];
};

export function MatchView({
  players,
  radiantWin,
}: {
  players: ViewPlayer[];
  radiantWin: boolean | null;
}) {
  const [selectedSlot, setSelectedSlot] = useState(
    (players.find((p) => p.isSearched) ?? players[0])?.slot,
  );
  const selected = players.find((p) => p.slot === selectedSlot);
  const detailRef = useRef<HTMLElement>(null);

  // Painel fica acima dos times; ao trocar de herói, rola até ele (só se
  // estiver fora da tela — "nearest" não mexe se já estiver visível).
  function select(slot: number) {
    setSelectedSlot(slot);
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const teams = [
    { name: "Radiant", players: players.filter((p) => p.isRadiant), won: radiantWin === true },
    { name: "Dire", players: players.filter((p) => !p.isRadiant), won: radiantWin === false },
  ];

  return (
    // delay curto: o preview não pisca ao passar o mouse por cima dos ícones
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-6">
        {selected && <PlayerDetail ref={detailRef} player={selected} />}

        {teams.map((team) => (
          <section key={team.name} className="flex flex-col gap-2">
            <h2 className="font-semibold">
              {team.name}
              {team.won && " — Vitória"}
            </h2>
            {/* table-fixed + larguras fixas: colunas alinhadas entre os dois times */}
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 w-[26%]">Herói</th>
                  <th className="w-[24%]">Jogador</th>
                  <th className="w-[12%]">K/D/A</th>
                  <th>Itens</th>
                </tr>
              </thead>
              <tbody>
                {team.players.map((p) => (
                  <tr
                    key={p.slot}
                    onClick={() => select(p.slot)}
                    className={cn(
                      "border-b cursor-pointer hover:bg-accent",
                      p.slot === selectedSlot && "bg-accent",
                    )}
                  >
                    <td className="py-2">
                      {/* botão = selecionável por teclado; o clique na linha é atalho */}
                      <button
                        type="button"
                        aria-pressed={p.slot === selectedSlot}
                        onClick={(e) => {
                          e.stopPropagation(); // a linha também tem onClick
                          select(p.slot);
                        }}
                        className="text-left"
                      >
                        <HeroCell heroId={p.heroId} hero={p.hero} />
                      </button>
                    </td>
                    <td className="truncate" title={p.playerName}>
                      {p.playerName}
                      {p.isSearched && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (você)
                        </span>
                      )}
                    </td>
                    <td>
                      {p.kills}/{p.deaths}/{p.assists}
                    </td>
                    <td>
                      <ItemRow items={[...p.items, ...p.neutral]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </TooltipProvider>
  );
}

function PlayerDetail({
  player: p,
  ref,
}: {
  player: ViewPlayer;
  ref: React.Ref<HTMLElement>;
}) {
  const fmt = (n: number | null) =>
    n === null ? "—" : n.toLocaleString("pt-BR");
  const stats: [string, string][] = [
    ["Nível", String(p.level)],
    ["K/D/A", `${p.kills}/${p.deaths}/${p.assists}`],
    ["GPM/XPM", `${p.gpm}/${p.xpm}`],
    ["Last hits / Denies", `${p.lastHits}/${p.denies}`],
    ["Patrimônio", fmt(p.netWorth)],
    ["Dano em heróis", fmt(p.heroDamage)],
    ["Dano em torres", fmt(p.towerDamage)],
    ["Cura", fmt(p.heroHealing)],
  ];

  return (
    <section
      ref={ref}
      className="flex flex-col gap-3 border rounded-md p-4 scroll-mt-4"
    >
      <h2 className="font-semibold flex items-center gap-2">
        <HeroCell heroId={p.heroId} hero={p.hero} />
        <span className="text-muted-foreground font-normal">
          · {p.playerName} · {p.isRadiant ? "Radiant" : "Dire"}
        </span>
      </h2>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 text-sm">
        <ItemList label="Itens" items={p.items} />
        <ItemList label="Mochila" items={p.backpack} />
        <ItemList label="Neutro" items={p.neutral} />
      </div>
    </section>
  );
}

/** Ícones compactos (tabela). */
function ItemRow({ items }: { items: (ViewItem | null)[] }) {
  return (
    <span className="flex gap-1">
      {items.map((it, i) =>
        it ? (
          <ItemIcon key={i} item={it} />
        ) : (
          <span key={i} className="w-[33px] h-6 rounded-sm bg-muted" />
        ),
      )}
    </span>
  );
}

/** Ícones com nome (painel do herói selecionado). */
function ItemList({
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
function ItemIcon({ item }: { item: ViewItem }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* button = o preview também abre pelo teclado (Tab) */}
        <button
          type="button"
          aria-label={item.name}
          className="rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {item.img ? (
            <Image
              src={item.img}
              alt={item.name}
              width={33}
              height={24}
              className="rounded-sm"
            />
          ) : (
            <span className="w-[33px] h-6 rounded-sm bg-muted text-[10px] flex items-center justify-center">
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
