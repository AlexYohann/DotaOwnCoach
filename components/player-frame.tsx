import Image from "next/image";
import Link from "next/link";
import { after } from "next/server";
import { cache } from "react";
import { Lock } from "lucide-react";
import { HeaderAccountSlot } from "@/components/header-account";
import { HeroBanner } from "@/components/hero-banner";
import { PageShell } from "@/components/page-shell";
import { VerifiedBadge } from "@/components/pro-suggestion-row";
import { ResultText, SideText } from "@/components/result-text";
import { SiteHeader } from "@/components/site-header";
import { OpenDotaErrorMessage, StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { getViewerAccountId } from "@/lib/account";
import { getHeroes, getPlayerData, type PlayerData } from "@/lib/data";
import { heroKey } from "@/lib/hero-art";
import { formatDateTime, formatDuration, getSide, isWin } from "@/lib/match";
import type { Hero, RecentMatch } from "@/lib/opendota";
import { canSeeDiary, tabHref, type PlayerTab } from "@/lib/player-access";
import { formatDecimal, mostPlayed, type MostPlayed } from "@/lib/player-summary";
import { refreshOwnProfile } from "@/lib/profile-refresh";
import { getVerifiedPro } from "@/lib/pros-data";
import { steamProfileUrl, toAccountId } from "@/lib/steam";
import { cn } from "@/lib/utils";

// Perfil do jogador (v2.4): banner + abas, comum às três páginas
// (/player/[id], /player/[id]/parceiros, /player/[id]/diario). Cada aba
// carrega só os próprios dados; o banner é o mesmo de antes.

const PUBLIC_DATA_TIP =
  'No Dota 2: Configurações → Opções → Social → ative "Expor dados públicos de partidas". Depois disso, pode levar um tempo até a OpenDota ver suas partidas novas.';

const ACCOUNT = <HeaderAccountSlot />;

/** O que cada aba recebe do quadro. */
export type PlayerCtx = {
  accountId: number;
  name: string;
  matches: RecentMatch[];
  heroes: Record<number, Hero>;
  viewerId: number | null;
  isOwner: boolean; // quem está vendo é o dono da página (logado)
};

// Uma busca por requisição, mesmo que mais de um componente peça.
const loadPlayer = cache(getPlayerData);

// decodeURIComponent lança URIError com "%" solto (ex.: "/player/100%").
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function PlayerFrame({
  params,
  tab,
  render,
}: {
  params: Promise<{ id: string }>;
  tab: PlayerTab;
  render: (ctx: PlayerCtx) => React.ReactNode | Promise<React.ReactNode>;
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
  let pro: Awaited<ReturnType<typeof getVerifiedPro>>;
  let viewerId: number | null;
  try {
    // Banco primeiro (10 min), OpenDota se vencido — ver lib/data.ts.
    // getHeroes, getVerifiedPro e getViewerAccountId nunca lançam e saem em paralelo.
    [player, heroes, pro, viewerId] = await Promise.all([
      loadPlayer(accountId),
      getHeroes(),
      getVerifiedPro(accountId),
      getViewerAccountId(),
    ]);
  } catch (err) {
    return (
      <PageShell account={ACCOUNT}>
        <OpenDotaErrorMessage error={err} />
      </PageShell>
    );
  }

  // Logado vendo a PRÓPRIA página: pede à OpenDota o nome e o avatar atuais
  // da Steam, no máximo uma vez por dia e depois da resposta.
  if (viewerId === accountId) {
    after(() => refreshOwnProfile(accountId));
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
          <p>O jogador não tem partidas registradas ou o perfil está privado.</p>
          <p>{PUBLIC_DATA_TIP}</p>
        </StatusMessage>
      </PageShell>
    );
  }

  // A API já manda da mais recente para a mais antiga; ordenar não custa nada.
  const last = [...matches].sort((a, b) => b.start_time - a.start_time)[0];
  const lastHero = heroes[last.hero_id];
  const top = mostPlayed(matches);
  const isOwner = canSeeDiary(viewerId, accountId);
  const ctx: PlayerCtx = { accountId, name, matches, heroes, viewerId, isOwner };

  return (
    <>
      <HeroBanner
        heroKey={heroKey(lastHero?.img)}
        poster={lastHero?.img ?? null}
        alt={lastHero?.name ?? ""}
        nav={<SiteHeader account={ACCOUNT} />}
      >
        <h1 className="font-display text-4xl font-bold uppercase leading-none">{name}</h1>
        {/* Só pro verificado: o nome da Steam (acima) quase nunca é o nick. */}
        {pro && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Pro:</span>
            <span className="font-semibold">{pro.name}</span>
            <VerifiedBadge />
            {pro.teamName && <span className="text-muted-foreground">· {pro.teamName}</span>}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {accountId} · últimas {matches.length} partidas · dados de{" "}
          {formatDateTime(freshness.fetchedAt)} ·{" "}
          <a
            href={steamProfileUrl(accountId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink underline underline-offset-4"
          >
            Perfil na Steam ↗
          </a>
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

      <PlayerTabs accountId={accountId} name={name} isOwner={isOwner} active={tab} />

      {await render(ctx)}
    </>
  );
}

function PlayerTabs({
  accountId,
  name,
  isOwner,
  active,
}: {
  accountId: number;
  name: string;
  isOwner: boolean;
  active: PlayerTab;
}) {
  const tabs: { tab: PlayerTab; label: React.ReactNode }[] = [
    {
      tab: "partidas",
      // no celular a fileira de abas não cabia: "Partidas" basta ali
      label: (
        <>
          <span className="sm:hidden">Partidas</span>
          <span className="hidden sm:inline">Últimas partidas</span>
        </>
      ),
    },
    { tab: "parceiros", label: isOwner ? "Quem joga comigo" : `Quem joga com ${name}` },
  ];
  if (isOwner) {
    tabs.push({
      tab: "diario",
      label: (
        <span className="inline-flex items-center gap-1.5" title="Só você vê">
          Diário
          <Lock aria-label="só você vê" className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
        </span>
      ),
    });
  }
  return (
    <nav aria-label="Seções do perfil" className="w-full max-w-6xl mx-auto px-6">
      <ul className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(({ tab, label }) => (
          <li key={tab} className="shrink-0">
            {/* sem prefetch: a aba de parceiros dispara a busca lenta da OpenDota */}
            <Link
              href={tabHref(accountId, tab)}
              prefetch={false}
              aria-current={tab === active ? "page" : undefined}
              className={cn(
                "-mb-px block border-b-2 px-2.5 py-2.5 text-sm font-semibold transition-colors sm:px-3",
                tab === active
                  ? "border-ember text-ink"
                  : "border-transparent text-muted-foreground hover:text-ink",
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
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
        {hero && <Image src={hero.img} alt={hero.name} width={56} height={32} className="rounded-sm" />}
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

/** Esqueleto enquanto o quadro carrega (dentro do Suspense de cada página). */
export function PlayerFallback() {
  return (
    <PageShell account={ACCOUNT}>
      <p className="text-muted-foreground">Buscando partidas na OpenDota…</p>
    </PageShell>
  );
}
