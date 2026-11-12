import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HeaderAccountSlot } from "@/components/header-account";
import { HeaderSearch } from "@/components/header-search";
import { PageShell } from "@/components/page-shell";
import { ProAvatar, VerifiedBadge } from "@/components/pro-suggestion-row";
import { RatingHelp } from "@/components/rating-help";
import { OpenDotaErrorMessage } from "@/components/status-message";
import { TeamCrest } from "@/components/team-crest";
import { getFeaturedTeams, type FeaturedTeam } from "@/lib/pros-data";

export const metadata: Metadata = { title: "Pro players" };

const ACCOUNT = <HeaderAccountSlot />;

// A caixa do cabeçalho some aqui (search={false}): a busca grande do corpo é a
// mesma busca, e duas na tela confundem.
export default function ProsPage() {
  return (
    <main className="flex-1 flex flex-col">
      <PageShell account={ACCOUNT} search={false}>
        <div>
          <h1 className="font-display text-4xl font-bold uppercase leading-none sm:text-5xl">
            Partidas dos <span className="text-ember">pro players</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Procure pelo nick. Não precisa saber o time nem acertar a grafia.
          </p>
        </div>
        <HeaderSearch size="lg" />

        <section className="mt-6">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold uppercase tracking-wider">
              Times em destaque
            </h2>
            <RatingHelp />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Os mais bem colocados que jogaram nos últimos 60 dias. Clique num
            jogador para ver as partidas.
          </p>
          {/* cacheComponents: a leitura do banco fica dentro de Suspense */}
          <Suspense
            fallback={
              <p className="mt-4 text-sm text-muted-foreground">
                Carregando os times…
              </p>
            }
          >
            <FeaturedTeams />
          </Suspense>
        </section>
      </PageShell>
    </main>
  );
}

async function FeaturedTeams() {
  let teams: FeaturedTeam[];
  try {
    // Banco primeiro; a OpenDota só entra se a lista estiver vazia ou vencida
    // (e aí renova depois da resposta) — ver lib/pros-data.ts.
    teams = await getFeaturedTeams();
  } catch (err) {
    return (
      <div className="mt-4">
        <OpenDotaErrorMessage error={err} />
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((team) => (
        <article
          key={team.teamId}
          className="rounded-lg border border-line bg-panel p-3.5"
        >
          <div className="mb-2 flex items-center gap-2.5 border-b border-line pb-2.5">
            <TeamCrest logo={team.logoUrl} tag={team.tag} size={38} />
            <div className="min-w-0">
              <h3 className="truncate font-display text-lg font-semibold uppercase leading-tight tracking-wide">
                {team.name}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                rating {Math.round(team.rating)}
              </p>
            </div>
          </div>
          <ul>
            {team.roster.map((p) => (
              <li key={p.accountId}>
                <Link
                  href={`/player/${p.accountId}`}
                  prefetch={false}
                  className="flex items-center gap-2 rounded px-1 py-1.5 text-sm transition-colors hover:bg-white/5"
                >
                  <ProAvatar src={p.avatar} name={p.name} size={22} />
                  <span className="truncate">{p.name}</span>
                  {p.verified && <VerifiedBadge className="h-[13px] w-[13px] text-[8px]" />}
                </Link>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
