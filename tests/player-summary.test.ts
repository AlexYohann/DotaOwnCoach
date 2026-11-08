import { describe, expect, it } from "vitest";
import type { RecentMatch } from "@/lib/opendota";
import { mostPlayed } from "@/lib/player-summary";

// Partida mínima: só o que mostPlayed usa importa.
function m(
  hero_id: number,
  start_time: number,
  result: "W" | "L" | null,
): RecentMatch {
  return {
    match_id: start_time,
    player_slot: 0, // Radiant
    radiant_win: result === null ? null : result === "W",
    hero_id,
    start_time,
    duration: 1800,
    kills: 0,
    deaths: 0,
    assists: 0,
    gold_per_min: 0,
    xp_per_min: 0,
    last_hits: 0,
  };
}

describe("mostPlayed", () => {
  it("lista vazia: null", () => {
    expect(mostPlayed([])).toBeNull();
  });

  it("herói com mais partidas, com vitórias e derrotas", () => {
    const ms = [
      m(99, 10, "W"),
      m(46, 9, "W"),
      m(99, 8, "L"),
      m(46, 7, "L"),
      m(99, 6, "W"),
    ];
    expect(mostPlayed(ms)).toEqual({ heroId: 99, games: 3, wins: 2, losses: 1 });
  });

  it("vitória do Dire conta como vitória de quem estava no Dire", () => {
    const dire: RecentMatch = { ...m(7, 1, null), player_slot: 130, radiant_win: false };
    expect(mostPlayed([dire])).toEqual({ heroId: 7, games: 1, wins: 1, losses: 0 });
  });

  it("empate: vence o herói da partida mais recente (start_time), não a ordem do array", () => {
    const tie = [m(99, 1, "W"), m(99, 2, "W"), m(46, 3, "L"), m(46, 50, "L")];
    expect(mostPlayed(tie)?.heroId).toBe(46);
  });

  it("resultado indefinido conta como partida, mas não como vitória nem derrota", () => {
    expect(mostPlayed([m(5, 2, "W"), m(5, 1, null)])).toEqual({
      heroId: 5,
      games: 2,
      wins: 1,
      losses: 0,
    });
  });
});
