import Link from "next/link";
import { Suspense } from "react";
import {
  MatchView,
  type MatchSummary,
  type ViewItem,
  type ViewPlayer,
} from "@/components/match-view";
import { HeaderAccountSlot } from "@/components/header-account";
import { PageShell } from "@/components/page-shell";
import {
  OpenDotaErrorMessage,
  StatusMessage,
} from "@/components/status-message";
import { heroKey } from "@/lib/hero-art";
import { formatDuration, formatStartTime, unitLabel } from "@/lib/match";
import { getHeroes, getMatchData } from "@/lib/data";
import {
  getItems,
  type Hero,
  type Item,
  type MatchDetail,
} from "@/lib/opendota";
import { toAccountId } from "@/lib/steam";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ player?: string | string[] }>;

export default function MatchPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <main className="flex-1 flex flex-col">
      {/* cacheComponents: params/searchParams/fetch ficam dentro de Suspense */}
      <Suspense
        fallback={
          <PageShell account={<HeaderAccountSlot />}>
            <p className="text-muted-foreground">Buscando a partida na OpenDota…</p>
          </PageShell>
        }
      >
        <MatchContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MatchContent({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // ?player= é opcional; se for inválido, só não destaca ninguém.
  const playerParam = Array.isArray(sp.player) ? sp.player[0] : sp.player;
  const searchedId = playerParam ? toAccountId(playerParam) : null;

  const back = searchedId
    ? { href: `/player/${searchedId}`, label: "← Voltar ao histórico" }
    : { href: "/", label: "← Nova busca" };
  const backLink = (
    <Link href={back.href} className="hover:text-ink">
      {back.label}
    </Link>
  );

  if (!/^\d{1,20}$/.test(id)) {
    return (
      <PageShell right={backLink} account={<HeaderAccountSlot />}>
        <StatusMessage title="ID de partida inválido">
          <p>O ID de uma partida tem só números (ex.: 9070284784).</p>
        </StatusMessage>
      </PageShell>
    );
  }

  let match: MatchDetail | null;
  let heroes: Record<number, Hero>;
  let items: Record<number, Item>;
  try {
    // getHeroes/getItems nunca lançam: se falharem, a página mostra os IDs.
    [match, heroes, items] = await Promise.all([
      getMatchData(Number(id)), // banco primeiro; partida salva nunca é rebuscada
      getHeroes(),
      getItems(),
    ]);
  } catch (err) {
    return (
      <PageShell right={backLink} account={<HeaderAccountSlot />}>
        <OpenDotaErrorMessage error={err} />
      </PageShell>
    );
  }

  if (!match) {
    return (
      <PageShell right={backLink} account={<HeaderAccountSlot />}>
        <StatusMessage title="Partida não encontrada">
          <p>
            A OpenDota não tem a partida {id}. Se ela acabou agora, tente de
            novo em alguns minutos.
          </p>
        </StatusMessage>
      </PageShell>
    );
  }

  const resolveItem = (itemId: number): ViewItem | null => {
    if (!itemId) return null; // 0 = slot vazio
    const it = items[itemId];
    return (
      it ?? {
        id: itemId,
        name: `Item #${itemId}`,
        img: null,
        cost: null,
        stats: [],
        abilities: [],
        cooldown: null,
        manaCost: null,
      }
    );
  };

  const players: ViewPlayer[] = match.players.map((p) => ({
    slot: p.player_slot,
    isRadiant: p.player_slot < 128,
    isSearched: searchedId !== null && p.account_id === searchedId,
    playerName: p.personaname ?? "Anônimo",
    heroId: p.hero_id,
    hero: heroes[p.hero_id] ?? null,
    heroKey: heroKey(heroes[p.hero_id]?.img),
    level: p.level,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    lastHits: p.last_hits,
    denies: p.denies,
    gpm: p.gold_per_min,
    xpm: p.xp_per_min,
    netWorth: p.net_worth,
    heroDamage: p.hero_damage,
    towerDamage: p.tower_damage,
    heroHealing: p.hero_healing,
    items: p.items.map(resolveItem),
    backpack: p.backpack.map(resolveItem),
    neutral: p.neutral.map(resolveItem),
    // Urso do Lone Druid: é ele quem carrega os itens.
    units: (p.units ?? []).map((u) => ({
      label: unitLabel(u.name),
      items: u.items.map(resolveItem),
      backpack: u.backpack.map(resolveItem),
      neutral: u.neutral.map(resolveItem),
    })),
    cosmetics: p.cosmetics ?? [], // detail antigo (v1) sem o campo: lista vazia
  }));

  // "Voltar às partidas de <nome>" quando o jogador buscado está na partida.
  const me = players.find((p) => p.isSearched);
  if (me) back.label = `← Voltar às partidas de ${me.playerName}`;

  const summary: MatchSummary = {
    matchId: match.match_id,
    when: formatStartTime(match.start_time),
    duration: formatDuration(match.duration),
    radiantScore: match.radiant_score,
    direScore: match.dire_score,
    radiantWin: match.radiant_win,
    backHref: back.href,
    backLabel: back.label,
  };

  return (
    <MatchView summary={summary} players={players} account={<HeaderAccountSlot />} />
  );
}
