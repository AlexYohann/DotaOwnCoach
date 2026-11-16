import Link from "next/link";
import { Suspense } from "react";
import { NotebookPen } from "lucide-react";
import { HeroCell } from "@/components/hero-cell";
import { PlayerFallback, PlayerFrame } from "@/components/player-frame";
import { ResultText, SideText } from "@/components/result-text";
import { Button } from "@/components/ui/button";
import type { Note } from "@/lib/diary";
import { formatDuration, formatStartTime, getSide, isWin } from "@/lib/match";
import { getMyNotesFor } from "@/lib/notes-data";
import type { Hero, RecentMatch } from "@/lib/opendota";
import { cn } from "@/lib/utils";

// Aba "Últimas partidas" do perfil. Os parceiros (v2.3) moraram aqui; desde a
// v2.4 têm aba própria (/player/[id]/parceiros), para não poluir esta tela.

export default function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="flex-1 flex flex-col">
      {/* cacheComponents: dados de request (params, fetch) ficam dentro de Suspense */}
      <Suspense fallback={<PlayerFallback />}>
        <PlayerFrame
          params={params}
          tab="partidas"
          render={async ({ accountId, matches, heroes, isOwner }) => {
            // Diário (v2.4): na própria página, as notas destas 20 partidas
            // (cliente da sessão, RLS). Visitantes não fazem esta leitura.
            const notes = isOwner ? await getMyNotesFor(matches.map((m) => m.match_id)) : null;
            return (
              // relative: os rótulos sr-only (absolutos) ficam presos aqui e não esticam a página no celular
              <div className="relative w-full max-w-6xl mx-auto px-6 pb-10 overflow-x-auto">
                <MatchTable matches={matches} heroes={heroes} accountId={accountId} notes={notes} />
              </div>
            );
          }}
        />
      </Suspense>
    </main>
  );
}

function MatchTable({
  matches,
  heroes,
  accountId,
  notes,
}: {
  matches: RecentMatch[];
  heroes: Record<number, Hero>;
  accountId: number;
  notes: Map<number, Note> | null; // null = não é a própria página (sem coluna de nota)
}) {
  return (
    <table className={cn("w-full text-sm", notes ? "min-w-[920px]" : "min-w-[760px]")}>
      <thead>
        <tr className="text-left text-xs text-muted-foreground border-b border-line">
          <th className="w-[3px] p-0">
            <span className="sr-only">Resultado</span>
          </th>
          <th className="py-2 pl-3 font-medium">Herói</th>
          <th className="font-medium">Data</th>
          <th className="font-medium">Resultado</th>
          <th className="font-medium">Lado</th>
          <th className="font-medium">K/D/A</th>
          <th className="font-medium">Duração</th>
          <th className="font-medium">GPM/XPM</th>
          <th className="font-medium">LH</th>
          {notes && <th className="font-medium">Nota</th>}
          <th>
            <span className="sr-only">Detalhes</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {matches.map((m) => {
          const win = m.radiant_win === null ? null : isWin(m.player_slot, m.radiant_win);
          const href = `/match/${m.match_id}?player=${accountId}`;
          return (
            <tr key={m.match_id} className="border-b border-line">
              <td className={cn("w-[3px] p-0", win === null ? "bg-line" : win ? "bg-win" : "bg-loss")} />
              <td className="py-2 pl-3">
                <HeroCell heroId={m.hero_id} hero={heroes[m.hero_id]} />
              </td>
              <td className="whitespace-nowrap">{formatStartTime(m.start_time)}</td>
              <td className="font-semibold">
                <ResultText win={win} />
              </td>
              <td>
                <SideText side={getSide(m.player_slot)} />
              </td>
              <td>
                {m.kills}/{m.deaths}/{m.assists}
              </td>
              <td>{formatDuration(m.duration)}</td>
              <td>
                {m.gold_per_min}/{m.xp_per_min}
              </td>
              <td>{m.last_hits}</td>
              {notes && (
                <td className="max-w-[220px]">
                  <NoteCell note={notes.get(m.match_id) ?? null} href={`${href}#nota`} />
                </td>
              )}
              <td className="text-right">
                <Button asChild variant="outline" size="sm" className="border-line bg-transparent">
                  {/* ?player= destaca e pré-seleciona este jogador na partida */}
                  <Link href={href}>Ver partida</Link>
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Etiquetas da nota (erros primeiro) ou o convite para anotar. */
function NoteCell({ note, href }: { note: Note | null; href: string }) {
  if (!note) {
    return (
      <Link href={href} className="text-xs text-muted-foreground hover:text-ink">
        + anotar
      </Link>
    );
  }
  const tags = [
    ...note.badTags.map((t) => ({ t, bad: true })),
    ...note.goodTags.map((t) => ({ t, bad: false })),
  ];
  const shown = tags.slice(0, 2);
  return (
    <Link href={href} className="flex items-center gap-1.5 overflow-hidden" title="Ver a nota">
      <NotebookPen aria-label="Tem nota" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      {shown.map(({ t, bad }) => (
        <span
          key={t}
          className={cn(
            "truncate rounded-full px-1.5 py-px text-[11px]",
            bad ? "bg-loss/15 text-loss" : "bg-win/15 text-win",
          )}
        >
          {t}
        </span>
      ))}
      {tags.length > shown.length && (
        <span className="shrink-0 text-[11px] text-muted-foreground">+{tags.length - shown.length}</span>
      )}
      {tags.length === 0 && <span className="text-[11px] text-muted-foreground">nota</span>}
    </Link>
  );
}
