"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NOTE_LIMITS, type DiaryFilter, type Period } from "@/lib/diary";
import { cn } from "@/lib/utils";

// Filtros do resumo do diário (v2.4). Ficam na URL (?periodo, ?heroi,
// ?partidas): a página é refeita no servidor e um filtro pode ser salvo.

export type HeroOption = { heroId: number; count: number; name: string };
export type PickNote = {
  matchId: number;
  heroName: string;
  heroImg: string | null;
  won: boolean | null;
  when: string; // já formatado no servidor (fuso de São Paulo)
  tags: { tag: string; bad: boolean }[];
};

const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
  { value: "tudo", label: "Tudo" },
];

function hrefFor(base: string, f: { period?: Period; heroId?: number | null; matchIds?: number[] | null }) {
  const q = new URLSearchParams();
  if (f.matchIds && f.matchIds.length > 0) q.set("partidas", f.matchIds.join(","));
  else {
    if (f.period !== undefined && f.period !== 30) q.set("periodo", String(f.period));
    if (f.heroId) q.set("heroi", String(f.heroId));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function DiaryFilters({
  base,
  filter,
  heroes,
  notes,
}: {
  base: string; // /player/<id>/diario
  filter: DiaryFilter;
  heroes: HeroOption[];
  notes: PickNote[];
}) {
  const router = useRouter();
  const picking = filter.matchIds !== null;
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<number>>(new Set(filter.matchIds ?? []));

  function toggle(id: number) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < NOTE_LIMITS.matchIds) next.add(id);
      return next;
    });
  }

  return (
    <div className="mb-5">
      <div className={cn("flex flex-wrap items-center gap-2", picking && "opacity-50")}>
        <div role="group" aria-label="Período" className="inline-flex overflow-hidden rounded-md border border-line text-xs">
          {PERIODS.map((p) => {
            const on = !picking && filter.period === p.value;
            return (
              <Link
                key={p.label}
                href={hrefFor(base, { period: p.value, heroId: filter.heroId })}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "px-3 py-1.5",
                  on ? "bg-ember font-semibold text-background" : "text-muted-foreground hover:text-ink",
                )}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="sr-only">Herói</span>
          <select
            value={picking ? "" : String(filter.heroId ?? "")}
            onChange={(e) =>
              router.push(
                hrefFor(base, { period: filter.period, heroId: e.target.value ? Number(e.target.value) : null }),
              )
            }
            className="rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-ember"
          >
            <option value="">Todos os heróis</option>
            {heroes.map((h) => (
              <option key={h.heroId} value={h.heroId}>
                {h.name} ({h.count})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-line px-2.5 py-1.5 font-semibold text-ink hover:border-ember/60"
        >
          Escolher partidas…
        </button>
        {picking && (
          <span className="text-muted-foreground">
            Mostrando {filter.matchIds!.length}{" "}
            {filter.matchIds!.length === 1 ? "partida escolhida" : "partidas escolhidas"}, sem comparação ·{" "}
            <Link href={base} className="font-semibold text-ink hover:underline">
              Limpar
            </Link>
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-md border border-line bg-panel p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.12em] text-ember">
            Suas partidas anotadas · {chosen.size} {chosen.size === 1 ? "escolhida" : "escolhidas"}
          </p>
          <ul className="max-h-80 overflow-y-auto">
            {notes.map((n) => (
              <li key={n.matchId}>
                <label className="flex cursor-pointer items-center gap-2.5 border-b border-line py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={chosen.has(n.matchId)}
                    onChange={() => toggle(n.matchId)}
                    className="h-4 w-4 accent-ember"
                  />
                  {n.heroImg ? (
                    <Image src={n.heroImg} alt="" width={44} height={25} className="shrink-0 rounded-sm" />
                  ) : (
                    <span className="h-[25px] w-11 shrink-0 rounded-sm bg-line" />
                  )}
                  <span className="w-28 shrink-0 truncate font-semibold text-ink">{n.heroName}</span>
                  <span className={cn("w-16 shrink-0", n.won === null ? "text-muted-foreground" : n.won ? "text-win" : "text-loss")}>
                    {n.won === null ? "—" : n.won ? "Vitória" : "Derrota"}
                  </span>
                  <span className="hidden w-32 shrink-0 text-xs text-muted-foreground sm:inline">{n.when}</span>
                  <span className="min-w-0 truncate text-[11px]">
                    {n.tags.slice(0, 3).map((t) => (
                      <span
                        key={t.tag}
                        className={cn("mr-1 rounded-full px-1.5 py-px", t.bad ? "bg-loss/15 text-loss" : "bg-win/15 text-win")}
                      >
                        {t.tag}
                      </span>
                    ))}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={chosen.size === 0}
              onClick={() => {
                setOpen(false);
                router.push(hrefFor(base, { matchIds: [...chosen] }));
              }}
              className="rounded-md bg-ember px-3 py-1.5 font-semibold text-background hover:opacity-90 disabled:opacity-40"
            >
              Ver resumo dessas partidas
            </button>
            <button type="button" onClick={() => setChosen(new Set())} className="text-muted-foreground hover:text-ink">
              Desmarcar todas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
