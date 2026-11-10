import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { HeaderAccountSlot } from "@/components/header-account";
import { HeroBanner } from "@/components/hero-banner";
import { HeroCell } from "@/components/hero-cell";
import { PageShell } from "@/components/page-shell";
import { ResultText, SideText } from "@/components/result-text";
import { SiteHeader } from "@/components/site-header";
import {
  OpenDotaErrorMessage,
  StatusMessage,
} from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { getHeroes, getPlayerData, type PlayerData } from "@/lib/data";
import { heroKey } from "@/lib/hero-art";
import {
  formatDateTime,
  formatDuration,
  formatStartTime,
  getSide,
  isWin,
} from "@/lib/match";
import type { Hero, RecentMatch } from "@/lib/opendota";
import { formatDecimal, mostPlayed, type MostPlayed } from "@/lib/player-summary";
import { toAccountId } from "@/lib/steam";
import { cn } from "@/lib/utils";

const PUBLIC_DATA_TIP =
  'No Dota 2: Configurações → Opções → Social → ative "Expor dados públicos de partidas". Depois disso, pode levar um tempo até a OpenDota ver suas partidas novas.';

// Canto do cabeçalho (Entrar com a Steam / menu da conta). A busca por outro
// ID agora fica no próprio cabeçalho, em todas as páginas.
const ACCOUNT = <HeaderAccountSlot />;

export default function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <main className="flex-1 flex flex-col">
      {/* cacheComponents: dados de request (params, fetch) ficam dentro de Suspense */}
      <Suspense
        fallback={
          <PageShell account={ACCOUNT}>
            <p className="text-muted-foreground">Buscando partidas na OpenDota…</p>
          </PageShell>
        }
      >
        <PlayerContent params={params} />
      </Suspense>
    </main>
  );
}

async function PlayerContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rawId = safeDecode(id);
  const accountId = toAccountId(rawId);

  if (accountId === null) {
    return (
      <PageShell account={ACCOUNT}>
        <StatusMessage title="ID inválido">
          <p>
            &quot;{rawId}&quot; não é um Steam ID válido. Use o código de amigo
            (ex.: 123456789) ou o SteamID64 (17 dígitos, começa com 7656119…).
          </p>
        </StatusMessage>
      </PageShell>
    );
  }

  let player: PlayerData | null;
  let heroes: Record<number, Hero>;
  try {
    // Banco primeiro (10 min), OpenDota se vencido — ver lib/data.ts.
    // getHeroes nunca lança: se falhar, devolve {} e a tabela mostra o hero_id.
    [player, heroes] = await Promise.all([
      getPlayerData(accountId),
      getHeroes(),
    ]);
  } catch (err) {
    return (
      <PageShell account={ACCOUNT}>
        <OpenDotaErrorMessage error={err} />
      </PageShell>
    );
  }

  if (!player) {
    return (
      <PageShell account={ACCOUNT}>
        <StatusMessage title="Jogador não encontrado">
          <p>
            A OpenDota não conhece a conta {accountId}. Confira o ID. Se estiver
            certo, o perfil pode estar privado.
          </p>
          <p>{PUBLIC_DATA_TIP}</p>
        </StatusMessage>
      </PageShell>
    );
  }

  const { profile, matches, freshness } = player;
  const name = profile.personaname ?? `Conta ${accountId}`;

  if (matches.length === 0) {
    return (
      <PageShell account={ACCOUNT}>
        <StatusMessage title={`${name}: nenhuma partida encontrada`}>
          <p>
            O jogador não tem partidas registradas ou o perfil está privado.
          </p>
          <p>{PUBLIC_DATA_TIP}</p>
        </StatusMessage>
      </PageShell>
    );
  }

  // A API já manda da mais recente para a mais antiga; ordenar não custa nada.
  const last = [...matches].sort((a, b) => b.start_time - a.start_time)[0];
  const lastHero = heroes[last.hero_id];
  const top = mostPlayed(matches);

  return (
    <>
      <HeroBanner
        heroKey={heroKey(lastHero?.img)}
        poster={lastHero?.img ?? null}
        alt={lastHero?.name ?? ""}
        nav={<SiteHeader account={ACCOUNT} />}
      >
        <h1 className="font-display text-4xl font-bold uppercase leading-none">
          {name}
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {accountId} · últimas {matches.length} partidas · dados de{" "}
          {formatDateTime(freshness.fetchedAt)}
        </p>
        {freshness.source === "stale" && (
          <p className="mt-2 text-sm text-amber-400">
            A OpenDota não respondeu agora. Mostrando os últimos dados salvos —
            partidas mais recentes podem estar faltando.
          </p>
        )}
        <LastMatch match={last} hero={lastHero} accountId={accountId} />
        {top && <MostPlayedCard top={top} hero={heroes[top.heroId]} />}
      </HeroBanner>

      {/* relative: os rótulos sr-only (absolutos) ficam presos aqui e não esticam a página no celular */}
      <div className="relative w-full max-w-6xl mx-auto px-6 pb-10 overflow-x-auto">
        <MatchTable matches={matches} heroes={heroes} accountId={accountId} />
      </div>
    </>
  );
}

const LABEL = "text-[10px] font-semibold uppercase tracking-[.12em] text-ember";

function LastMatch({
  match: m,
  hero,
  accountId,
}: {
  match: RecentMatch;
  hero: Hero | undefined;
  accountId: number;
}) {
  const win = m.radiant_win === null ? null : isWin(m.player_slot, m.radiant_win);
  return (
    <div className="mt-6">
      <p className={LABEL}>Última partida</p>
      <p className="font-display text-3xl font-bold uppercase leading-none">
        {hero?.name ?? `hero_id ${m.hero_id}`}
      </p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-display uppercase">
        <ResultText win={win} className="text-3xl font-bold" />
        <span className="text-xl font-semibold tracking-wide">
          · <SideText side={getSide(m.player_slot)} /> ·
        </span>
        <span className="text-3xl font-bold">
          {m.kills} / {m.deaths} / {m.assists}
        </span>
        <span className="font-sans text-xs normal-case text-muted-foreground">
          {formatDuration(m.duration)} · {m.gold_per_min} GPM
        </span>
      </p>
      <Button asChild variant="outline" size="sm" className="mt-3 border-line bg-transparent">
        <Link href={`/match/${m.match_id}?player=${accountId}`}>Ver partida</Link>
      </Button>
    </div>
  );
}

function MostPlayedCard({ top, hero }: { top: MostPlayed; hero: Hero | undefined }) {
  const { avg } = top;
  const one = (n: number) => formatDecimal(n, 1);
  const int = (n: number) => formatDecimal(n, 0);
  // Mockup A (v2.0): grade 3 × 2 com as médias desse herói nas partidas dele.
  const stats: [string, string][] = [
    ["K/D/A", `${one(avg.kills)}/${one(avg.deaths)}/${one(avg.assists)}`],
    ["KDA", one(avg.kda)],
    ["Vitórias", avg.winRate === null ? "—" : `${Math.round(avg.winRate * 100)}%`],
    ["GPM", int(avg.gpm)],
    ["XPM", int(avg.xpm)],
    ["Last hits", int(avg.lastHits)],
  ];
  return (
    <div className="mt-5 inline-block rounded-md border border-line bg-panel/90 px-3 py-2">
      <div className="flex items-center gap-3">
        {hero && (
          <Image src={hero.img} alt={hero.name} width={56} height={32} className="rounded-sm" />
        )}
        <div>
          <p className={LABEL}>Mais jogado</p>
          <p className="text-sm font-semibold">{hero?.name ?? `hero_id ${top.heroId}`}</p>
          <p className="text-xs text-muted-foreground">
            {top.games} de 20 · <span className="text-win">{top.wins}V</span>{" "}
            <span className="text-loss">{top.losses}D</span>
          </p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-5 gap-y-2">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MatchTable({
  matches,
  heroes,
  accountId,
}: {
  matches: RecentMatch[];
  heroes: Record<number, Hero>;
  accountId: number;
}) {
  return (
    <table className="w-full min-w-[760px] text-sm">
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
          <th>
            <span className="sr-only">Detalhes</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {matches.map((m) => {
          const win =
            m.radiant_win === null ? null : isWin(m.player_slot, m.radiant_win);
          return (
            <tr key={m.match_id} className="border-b border-line">
              <td
                className={cn(
                  "w-[3px] p-0",
                  win === null ? "bg-line" : win ? "bg-win" : "bg-loss",
                )}
              />
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
              <td className="text-right">
                <Button asChild variant="outline" size="sm" className="border-line bg-transparent">
                  {/* ?player= destaca e pré-seleciona este jogador na partida */}
                  <Link href={`/match/${m.match_id}?player=${accountId}`}>
                    Ver partida
                  </Link>
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// decodeURIComponent lança URIError com "%" solto (ex.: "/player/100%").
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
