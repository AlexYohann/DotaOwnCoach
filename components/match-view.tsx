"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { HeroBanner } from "@/components/hero-banner";
import { ItemList, type ViewItem } from "@/components/match-items";
import { ResultText, SideText } from "@/components/result-text";
import { SiteHeader } from "@/components/site-header";
import { TeamTables } from "@/components/team-tables";
import { TooltipProvider } from "@/components/ui/tooltip";
import { rarityColor } from "@/lib/hero-art";
import type { Cosmetic } from "@/lib/opendota"; // só o tipo

export type { ViewItem };

export type ViewPlayer = {
  slot: number;
  isRadiant: boolean;
  isSearched: boolean; // o jogador que veio do histórico (?player=)
  playerName: string;
  heroId: number;
  hero: { name: string; img: string } | null;
  heroKey: string | null; // animação do herói (null = sem animação)
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
  cosmetics: Cosmetic[];
};

/** Resumo da partida, já formatado no servidor. */
export type MatchSummary = {
  matchId: number;
  when: string; // "20/01/2025, 13:12"
  duration: string; // "49:36"
  radiantScore: number;
  direScore: number;
  radiantWin: boolean | null;
  backHref: string;
  backLabel: string;
};

const LABEL = "text-[10px] font-semibold uppercase tracking-[.12em] text-ember";

export function MatchView({
  summary,
  players,
}: {
  summary: MatchSummary;
  players: ViewPlayer[];
}) {
  const [selectedSlot, setSelectedSlot] = useState(
    (players.find((p) => p.isSearched) ?? players[0])?.slot,
  );
  const selected = players.find((p) => p.slot === selectedSlot);
  const topRef = useRef<HTMLDivElement>(null);

  // O painel fica no cabeçalho; ao escolher um herói nas tabelas, sobe até
  // ele (só se estiver fora da tela — "nearest" não mexe se já estiver visível).
  function select(slot: number) {
    setSelectedSlot(slot);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const me = players.find((p) => p.isSearched);
  const { radiantWin } = summary;

  return (
    // delay curto: o preview não pisca ao passar o mouse por cima dos ícones
    <TooltipProvider delayDuration={150}>
      <div ref={topRef} className="scroll-mt-4">
        <HeroBanner
          heroKey={selected?.heroKey ?? null}
          poster={selected?.hero?.img ?? null}
          alt={selected?.hero?.name ?? ""}
          nav={
            <SiteHeader
              right={
                <Link href={summary.backHref} className="hover:text-ink">
                  {summary.backLabel}
                </Link>
              }
            />
          }
        >
          <p className="text-xs text-muted-foreground">
            Partida {summary.matchId} · {summary.when} · {summary.duration}
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3 font-display uppercase">
            {me ? (
              <>
                <ResultText
                  win={radiantWin === null ? null : me.isRadiant === radiantWin}
                  className="text-4xl font-bold"
                />
                <span className="text-xl font-semibold tracking-wide">
                  · <SideText side={me.isRadiant ? "Radiant" : "Dire"} /> ·
                </span>
              </>
            ) : (
              <span className="text-4xl font-bold">
                {radiantWin === null ? "—" : radiantWin ? "Radiant venceu" : "Dire venceu"}
              </span>
            )}
            <span className="text-4xl font-bold">
              {summary.radiantScore}{" "}
              <span className="text-2xl text-muted-foreground">×</span>{" "}
              {summary.direScore}
            </span>
          </p>
          {selected && <PlayerPanel player={selected} />}
        </HeroBanner>
      </div>

      <div className="w-full max-w-6xl mx-auto px-6 pb-10">
        <TeamTables
          players={players}
          selectedSlot={selectedSlot}
          onSelect={select}
          radiantWin={radiantWin}
        />
      </div>
    </TooltipProvider>
  );
}

function PlayerPanel({ player: p }: { player: ViewPlayer }) {
  const fmt = (n: number | null) =>
    n === null ? "—" : n.toLocaleString("pt-BR");
  const stats: [string, string][] = [
    ["Nível", String(p.level)],
    ["GPM / XPM", `${p.gpm} / ${p.xpm}`],
    ["Last hits / Denies", `${p.lastHits} / ${p.denies}`],
    ["Patrimônio", fmt(p.netWorth)],
    ["Dano em heróis", fmt(p.heroDamage)],
    ["Dano em torres", fmt(p.towerDamage)],
    ["Cura", fmt(p.heroHealing)],
  ];

  return (
    <section aria-live="polite" className="mt-6 flex flex-col gap-4">
      <div>
        <p className={LABEL}>{p.isSearched ? "Você" : "Herói selecionado"}</p>
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-display text-3xl font-bold uppercase">
            {p.hero?.name ?? `hero_id ${p.heroId}`}
          </span>
          <span className="text-sm text-muted-foreground">
            {p.playerName} · <SideText side={p.isRadiant ? "Radiant" : "Dire"} />
          </span>
        </p>
        <p className="font-display text-2xl font-bold">
          {p.kills} / {p.deaths} / {p.assists}
        </p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm w-fit">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2 text-sm">
        <ItemList label="Itens" items={p.items} />
        <ItemList label="Mochila" items={p.backpack} />
        <ItemList label="Neutro" items={p.neutral} />
      </div>

      <Cosmetics items={p.cosmetics} />
    </section>
  );
}

// A OpenDota só entrega cosméticos de partidas antigas (ex.: patch 56, jan/2025);
// no patch 60 vêm vazios até em partidas processadas. Sem dados → sem seção
// (uma frase "sem cosméticos" daria a entender que ninguém usava nada).
function Cosmetics({ items }: { items: Cosmetic[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={LABEL}>Cosméticos</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((c, i) => (
          <li
            key={`${c.name}-${i}`}
            title={c.rarity}
            className="flex items-center gap-1.5 rounded border border-line border-l-[3px] bg-panel/85 py-0.5 pl-0.5 pr-2 text-xs"
            style={{ borderLeftColor: rarityColor(c.rarity) }}
          >
            <CosmeticIcon src={c.img} />
            {c.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ícone do cosmético; sem ícone ou com erro (404) → quadrado neutro. */
function CosmeticIcon({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span aria-hidden className="h-[23px] w-[34px] rounded-sm bg-accent" />;
  }
  return (
    <Image
      src={src}
      alt=""
      width={34}
      height={23}
      onError={() => setFailed(true)}
      className="h-[23px] w-[34px] rounded-sm object-cover"
    />
  );
}
