"use client";

import { useEffect, useState } from "react";
import { HeroCell } from "@/components/hero-cell";
import { ItemRow } from "@/components/match-items";
import type { ViewPlayer } from "@/components/match-view";
import {
  nextSort,
  sortPlayers,
  teamTotal,
  type SortKey,
  type SortState,
} from "@/lib/team-sort";
import { cn } from "@/lib/utils";

type Mode = "full" | "compact";
// Preferência do modo, guardada no navegador.
const MODE_KEY = "dota-own-coach:team-mode";

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR"));

/**
 * Times da partida em dois modos: "Empilhados" (completo) e "Lado a lado"
 * (minimalista). Cabeçalhos numéricos ordenam dentro de cada time.
 */
export function TeamTables({
  players,
  selectedSlot,
  onSelect,
  radiantWin,
}: {
  players: ViewPlayer[];
  selectedSlot: number | undefined;
  onSelect: (slot: number) => void;
  radiantWin: boolean | null;
}) {
  const [mode, setMode] = useState<Mode>("full");
  const [sort, setSort] = useState<SortState>(null);

  // Lido depois de montar: o HTML do servidor é sempre "full" (sem diferença na hidratação).
  useEffect(() => {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "full" || saved === "compact") setMode(saved);
  }, []);

  function changeMode(m: Mode) {
    setMode(m);
    localStorage.setItem(MODE_KEY, m);
  }

  const onSort = (k: SortKey) => setSort((s) => nextSort(s, k));
  const teams = [
    { name: "Radiant", won: radiantWin === true, players: players.filter((p) => p.isRadiant) },
    { name: "Dire", won: radiantWin === false, players: players.filter((p) => !p.isRadiant) },
  ].map((t) => ({ ...t, sorted: sortPlayers(t.players, sort) }));

  const rowProps = { selectedSlot, onSelect };

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Modo dos times" className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Times:</span>
        {(
          [
            ["full", "Empilhados"],
            ["compact", "Lado a lado"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => changeMode(m)}
            className={cn(
              "rounded border px-3 py-1",
              mode === m ? "border-ember text-ink" : "border-line text-muted-foreground hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "full" ? (
        teams.map((t) => (
          <section key={t.name} className="flex flex-col gap-2">
            <TeamTitle name={t.name} won={t.won}>
              <span className="ml-3 font-sans text-xs font-normal normal-case text-muted-foreground">
                patrimônio total {fmt(teamTotal(t.players, "netWorth"))} · dano em heróis{" "}
                {fmt(teamTotal(t.players, "heroDamage"))}
              </span>
            </TeamTitle>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[1100px] table-fixed text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted-foreground">
                    <th className="w-[17%] py-2 pl-2 font-medium">Herói</th>
                    <th className="w-[10%] font-medium">Jogador</th>
                    <SortTh k="level" label="Nív." className="w-[4%]" sort={sort} onSort={onSort} />
                    <SortTh k="kills" label="K/D/A" className="w-[6%]" sort={sort} onSort={onSort} />
                    <SortTh k="lastHits" label="LH/DN" className="w-[6%]" sort={sort} onSort={onSort} />
                    <SortTh k="gpm" label="GPM/XPM" className="w-[7%]" sort={sort} onSort={onSort} />
                    <SortTh k="netWorth" label="Patrimônio" className="w-[7%]" sort={sort} onSort={onSort} />
                    <SortTh k="heroDamage" label="Dano heróis" className="w-[6%]" sort={sort} onSort={onSort} />
                    <SortTh k="towerDamage" label="Dano torres" className="w-[6%]" sort={sort} onSort={onSort} />
                    <th className="font-medium">Itens · mochila · neutro</th>
                  </tr>
                </thead>
                <tbody>
                  {t.sorted.map((p) => (
                    <PlayerRow key={p.slot} p={p} {...rowProps}>
                      <td className="truncate" title={p.playerName}>
                        {p.playerName}
                        {p.isSearched && <You />}
                      </td>
                      <td>{p.level}</td>
                      <td>
                        {p.kills}/{p.deaths}/{p.assists}
                      </td>
                      <td>
                        {p.lastHits}/{p.denies}
                      </td>
                      <td>
                        {p.gpm}/{p.xpm}
                      </td>
                      <td>{fmt(p.netWorth)}</td>
                      <td>{fmt(p.heroDamage)}</td>
                      <td>{fmt(p.towerDamage)}</td>
                      <td>
                        <span className="flex items-center gap-3">
                          <ItemRow items={p.items} size="sm" />
                          <span className="opacity-70">
                            <ItemRow items={p.backpack} size="xs" />
                          </span>
                          <ItemRow items={p.neutral} size="sm" />
                        </span>
                      </td>
                    </PlayerRow>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {teams.map((t) => (
            <section key={t.name} className="flex min-w-0 flex-col gap-2">
              <TeamTitle name={t.name} won={t.won} />
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted-foreground">
                    <th className="w-[42%] py-2 pl-2 font-medium">Herói</th>
                    <SortTh k="kills" label="K/D/A" className="w-[16%]" sort={sort} onSort={onSort} />
                    <th className="font-medium">Itens</th>
                  </tr>
                </thead>
                <tbody>
                  {t.sorted.map((p) => (
                    <PlayerRow key={p.slot} p={p} {...rowProps} you>
                      <td>
                        {p.kills}/{p.deaths}/{p.assists}
                      </td>
                      <td className="overflow-hidden">
                        <ItemRow items={[...p.items, ...p.neutral]} />
                      </td>
                    </PlayerRow>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamTitle({
  name,
  won,
  children,
}: {
  name: string;
  won: boolean;
  children?: React.ReactNode;
}) {
  return (
    <h2 className="font-display text-xl font-bold uppercase tracking-wide">
      {name}
      {won && <span className="ml-2 text-sm text-win">· venceu</span>}
      {children}
    </h2>
  );
}

function You() {
  return <span className="ml-1 text-xs text-muted-foreground">(você)</span>;
}

/** Linha do jogador: clicável, com o herói como botão (teclado). */
function PlayerRow({
  p,
  selectedSlot,
  onSelect,
  you = false,
  children,
}: {
  p: ViewPlayer;
  selectedSlot: number | undefined;
  onSelect: (slot: number) => void;
  you?: boolean; // mostrar "(você)" ao lado do herói (modo sem coluna Jogador)
  children: React.ReactNode;
}) {
  const selected = p.slot === selectedSlot;
  return (
    <tr
      onClick={() => onSelect(p.slot)}
      className={cn(
        "cursor-pointer border-b border-line hover:bg-accent/60",
        selected && "bg-accent shadow-[inset_3px_0_0_#e4572e]",
      )}
    >
      <td className="overflow-hidden py-2 pl-2">
        {/* botão = selecionável por teclado; o clique na linha é atalho */}
        <button
          type="button"
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation(); // a linha também tem onClick
            onSelect(p.slot);
          }}
          className="flex items-center text-left"
        >
          <HeroCell heroId={p.heroId} hero={p.hero} />
          {you && p.isSearched && <You />}
        </button>
      </td>
      {children}
    </tr>
  );
}

/** Cabeçalho ordenável: maior primeiro → menor primeiro → ordem original. */
function SortTh({
  k,
  label,
  className,
  sort,
  onSort,
}: {
  k: SortKey;
  label: string;
  className?: string;
  sort: SortState;
  onSort: (k: SortKey) => void;
}) {
  const dir = sort?.key === k ? sort.dir : null;
  return (
    <th
      aria-sort={dir === "desc" ? "descending" : dir === "asc" ? "ascending" : "none"}
      className={cn("font-medium", className)}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 hover:text-ink", dir && "text-ink")}
      >
        {label}
        <span aria-hidden className="w-2 text-ember">
          {dir === "desc" ? "▼" : dir === "asc" ? "▲" : ""}
        </span>
      </button>
    </th>
  );
}
