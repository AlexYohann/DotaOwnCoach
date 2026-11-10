import { isWin } from "@/lib/match";
import type { RecentMatch } from "@/lib/opendota";

/** Médias do herói nas partidas dele (valores brutos; arredonda quem mostra). */
export type HeroAverages = {
  kills: number;
  deaths: number;
  assists: number;
  kda: number; // (soma K + soma A) / max(1, soma D)
  winRate: number | null; // 0..1 entre as partidas com resultado; null = nenhuma
  gpm: number;
  xpm: number;
  lastHits: number;
};

export type MostPlayed = {
  heroId: number;
  games: number;
  wins: number;
  losses: number;
  avg: HeroAverages;
};

type Totals = {
  heroId: number;
  games: number;
  wins: number;
  losses: number;
  last: number;
  kills: number;
  deaths: number;
  assists: number;
  gpm: number;
  xpm: number;
  lastHits: number;
};

/**
 * Herói mais jogado nas partidas dadas, com as médias dele. Empate → o herói
 * jogado mais recentemente. Partida com resultado indefinido conta em games
 * (e nas médias), não em wins/losses. null = nenhuma partida.
 */
export function mostPlayed(matches: RecentMatch[]): MostPlayed | null {
  const byHero = new Map<number, Totals>();
  for (const m of matches) {
    const t = byHero.get(m.hero_id) ?? {
      heroId: m.hero_id,
      games: 0,
      wins: 0,
      losses: 0,
      last: -Infinity,
      kills: 0,
      deaths: 0,
      assists: 0,
      gpm: 0,
      xpm: 0,
      lastHits: 0,
    };
    t.games++;
    if (m.radiant_win !== null) {
      if (isWin(m.player_slot, m.radiant_win)) t.wins++;
      else t.losses++;
    }
    t.last = Math.max(t.last, m.start_time);
    t.kills += m.kills;
    t.deaths += m.deaths;
    t.assists += m.assists;
    t.gpm += m.gold_per_min;
    t.xpm += m.xp_per_min;
    t.lastHits += m.last_hits;
    byHero.set(m.hero_id, t);
  }

  let best: Totals | null = null;
  for (const t of byHero.values()) {
    if (!best || t.games > best.games || (t.games === best.games && t.last > best.last)) {
      best = t;
    }
  }
  if (!best) return null;

  const n = best.games;
  const decided = best.wins + best.losses;
  return {
    heroId: best.heroId,
    games: best.games,
    wins: best.wins,
    losses: best.losses,
    avg: {
      kills: best.kills / n,
      deaths: best.deaths / n,
      assists: best.assists / n,
      kda: (best.kills + best.assists) / Math.max(1, best.deaths),
      winRate: decided > 0 ? best.wins / decided : null,
      gpm: best.gpm / n,
      xpm: best.xpm / n,
      lastHits: best.lastHits / n,
    },
  };
}

/** Número em pt-BR com casas fixas: formatDecimal(7.25, 1) = "7,3". */
export function formatDecimal(value: number, digits: 0 | 1): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
