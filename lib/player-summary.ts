import { isWin } from "@/lib/match";
import type { RecentMatch } from "@/lib/opendota";

export type MostPlayed = {
  heroId: number;
  games: number;
  wins: number;
  losses: number;
};

/**
 * Herói mais jogado nas partidas dadas. Empate → o herói jogado mais
 * recentemente. Partida com resultado indefinido conta em games, não em
 * wins/losses. null = nenhuma partida.
 */
export function mostPlayed(matches: RecentMatch[]): MostPlayed | null {
  const byHero = new Map<number, MostPlayed & { last: number }>();
  for (const m of matches) {
    const s = byHero.get(m.hero_id) ?? {
      heroId: m.hero_id,
      games: 0,
      wins: 0,
      losses: 0,
      last: -Infinity,
    };
    s.games++;
    if (m.radiant_win !== null) {
      if (isWin(m.player_slot, m.radiant_win)) s.wins++;
      else s.losses++;
    }
    s.last = Math.max(s.last, m.start_time);
    byHero.set(m.hero_id, s);
  }

  let best: (MostPlayed & { last: number }) | null = null;
  for (const s of byHero.values()) {
    if (!best || s.games > best.games || (s.games === best.games && s.last > best.last)) {
      best = s;
    }
  }
  if (!best) return null;
  return { heroId: best.heroId, games: best.games, wins: best.wins, losses: best.losses };
}
