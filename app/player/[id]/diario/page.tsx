import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DiaryFilters } from "@/components/diary-filters";
import { DiarySummaryView } from "@/components/diary-summary";
import { PlayerFallback, PlayerFrame } from "@/components/player-frame";
import { getItems } from "@/lib/data";
import { heroOptions, parseDiaryFilter, selectNotes, summarize } from "@/lib/diary";
import { formatStartTime } from "@/lib/match";
import { getMyNotes } from "@/lib/notes-data";
import { tabHref } from "@/lib/player-access";

// Aba "Diário" (v2.4): resumo das notas de quem está logado, só na própria
// página. Para qualquer outra pessoa a página não existe (404) e nenhuma nota
// é lida. As notas vêm com a sessão (RLS); o cálculo é lib/diary.ts.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DiaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  return (
    <main className="flex-1 flex flex-col">
      <Suspense fallback={<PlayerFallback />}>
        <PlayerFrame
          params={params}
          tab="diario"
          render={async ({ accountId, heroes, isOwner }) => {
            if (!isOwner) notFound();
            const [sp, notes, items] = await Promise.all([searchParams, getMyNotes(), getItems()]);
            const base = tabHref(accountId, "diario");

            if (notes.length === 0) {
              return (
                <div className="w-full max-w-6xl mx-auto px-6 pb-10">
                  <div className="rounded-md border border-line bg-panel p-5 text-sm">
                    <p className="font-semibold text-ink">Seu diário ainda está vazio.</p>
                    <p className="mt-1 text-muted-foreground">
                      Abra uma partida sua e use &quot;Anotar esta partida&quot;: o que deu certo, o que deu
                      errado e os itens que faltaram. Com algumas notas, este resumo mostra o que mais se repete.
                    </p>
                    <Link
                      href={tabHref(accountId, "partidas")}
                      className="mt-3 inline-block font-semibold text-ember hover:underline"
                    >
                      Ver minhas partidas
                    </Link>
                  </div>
                </div>
              );
            }

            const filter = parseDiaryFilter(sp);
            const nowMs = Date.now();
            const { current, previous } = selectNotes(notes, filter, nowMs);
            const summary = summarize(current, previous);
            const heroName = (id: number) => heroes[id]?.name ?? `hero_id ${id}`;

            return (
              <div className="w-full max-w-6xl mx-auto px-6 pb-10">
                <DiaryFilters
                  base={base}
                  filter={filter}
                  heroes={heroOptions(notes).map((h) => ({ ...h, name: heroName(h.heroId) }))}
                  notes={notes.map((n) => ({
                    matchId: n.matchId,
                    heroName: heroName(n.heroId),
                    heroImg: heroes[n.heroId]?.img ?? null,
                    won: n.won,
                    when: formatStartTime(Date.parse(n.playedAt) / 1000),
                    tags: [
                      ...n.badTags.map((tag) => ({ tag, bad: true })),
                      ...n.goodTags.map((tag) => ({ tag, bad: false })),
                    ],
                  }))}
                />
                {current.length === 0 ? (
                  <p className="rounded-md border border-line bg-panel p-5 text-sm text-muted-foreground">
                    Nenhuma nota neste filtro.
                  </p>
                ) : (
                  <DiarySummaryView summary={summary} heroes={heroes} items={items} accountId={accountId} />
                )}
              </div>
            );
          }}
        />
      </Suspense>
    </main>
  );
}
