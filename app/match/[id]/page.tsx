import Link from "next/link";
import { Suspense } from "react";
import { MatchView, type ViewItem, type ViewPlayer } from "@/components/match-view";
import {
  OpenDotaErrorMessage,
  StatusMessage,
} from "@/components/status-message";
import { formatDuration, formatStartTime, isWin } from "@/lib/match";
import {
  getHeroes,
  getItems,
  getMatch,
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
    <main className="min-h-screen flex flex-col items-center p-8">
      <div className="w-full max-w-5xl flex flex-col gap-6">
        {/* cacheComponents: params/searchParams/fetch ficam dentro de Suspense */}
        <Suspense fallback={<p>Buscando a partida na OpenDota…</p>}>
          <MatchContent params={params} searchParams={searchParams} />
        </Suspense>
      </div>
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

  const backLink = searchedId ? (
    <Link href={`/player/${searchedId}`} className="text-sm underline">
      ← Voltar ao histórico
    </Link>
  ) : (
    <Link href="/" className="text-sm underline">
      ← Nova busca
    </Link>
  );

  if (!/^\d{1,20}$/.test(id)) {
    return (
      <>
        {backLink}
        <StatusMessage title="ID de partida inválido">
          <p>O ID de uma partida tem só números (ex.: 9070284784).</p>
        </StatusMessage>
      </>
    );
  }

  let match: MatchDetail | null;
  let heroes: Record<number, Hero>;
  let items: Record<number, Item>;
  try {
    // getHeroes/getItems nunca lançam: se falharem, a página mostra os IDs.
    [match, heroes, items] = await Promise.all([
      getMatch(Number(id)),
      getHeroes(),
      getItems(),
    ]);
  } catch (err) {
    return (
      <>
        {backLink}
        <OpenDotaErrorMessage error={err} />
      </>
    );
  }

  if (!match) {
    return (
      <>
        {backLink}
        <StatusMessage title="Partida não encontrada">
          <p>
            A OpenDota não tem a partida {id}. Se ela acabou agora, tente de
            novo em alguns minutos.
          </p>
        </StatusMessage>
      </>
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
  }));

  const me = players.find((p) => p.isSearched);
  const myResult =
    me && match.radiant_win !== null
      ? isWin(me.slot, match.radiant_win)
        ? "Vitória"
        : "Derrota"
      : null;

  return (
    <>
      {backLink}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">
          Partida {match.match_id}
          {myResult && <span className="ml-2 font-normal">· {myResult}</span>}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatStartTime(match.start_time)} · {formatDuration(match.duration)}{" "}
          · Radiant {match.radiant_score} × {match.dire_score} Dire
        </p>
        <p className="text-sm text-muted-foreground">
          Clique num herói para ver as estatísticas dele.
        </p>
      </header>
      <MatchView players={players} radiantWin={match.radiant_win} />
    </>
  );
}
