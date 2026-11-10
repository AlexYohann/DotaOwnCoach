import { describe, expect, it } from "vitest";
import type { RecentMatch } from "@/lib/opendota";
import { formatDecimal, mostPlayed } from "@/lib/player-summary";

// Partida mínima: só o que mostPlayed usa importa.
function m(
  hero_id: number,
  start_time: number,
  result: "W" | "L" | null,
  stats: Partial<RecentMatch> = {},
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
    ...stats,
  };
}

// Atalho: (k, d, a, gpm, xpm, lh).
const s = (k: number, d: number, a: number, gpm: number, xpm: number, lh: number) => ({
  kills: k,
  deaths: d,
  assists: a,
  gold_per_min: gpm,
  xp_per_min: xpm,
  last_hits: lh,
});

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
    expect(mostPlayed(ms)).toMatchObject({ heroId: 99, games: 3, wins: 2, losses: 1 });
  });

  it("vitória do Dire conta como vitória de quem estava no Dire", () => {
    const dire: RecentMatch = { ...m(7, 1, null), player_slot: 130, radiant_win: false };
    expect(mostPlayed([dire])).toMatchObject({ heroId: 7, games: 1, wins: 1, losses: 0 });
  });

  it("empate: vence o herói da partida mais recente (start_time), não a ordem do array", () => {
    const tie = [m(99, 1, "W"), m(99, 2, "W"), m(46, 3, "L"), m(46, 50, "L")];
    expect(mostPlayed(tie)?.heroId).toBe(46);
  });

  it("resultado indefinido conta como partida, mas não como vitória nem derrota", () => {
    expect(mostPlayed([m(5, 2, "W"), m(5, 1, null)])).toMatchObject({
      heroId: 5,
      games: 2,
      wins: 1,
      losses: 0,
    });
  });
});

describe("médias do herói mais jogado", () => {
  it("médias do herói mais jogado", () => {
    const ms = [
      m(99, 3, "W", s(10, 2, 5, 500, 600, 100)),
      m(46, 2, "L", s(30, 30, 30, 900, 900, 900)), // outro herói: fora da média
      m(99, 1, "W", s(4, 0, 8, 300, 400, 50)),
    ];
    expect(mostPlayed(ms)?.avg).toEqual({
      kills: 7,
      deaths: 1,
      assists: 6.5,
      kda: 13.5,
      winRate: 1,
      gpm: 400,
      xpm: 500,
      lastHits: 75,
    });
  });

  it("KDA sem nenhuma morte divide por 1", () => {
    expect(mostPlayed([m(1, 1, "W", s(4, 0, 8, 0, 0, 0))])?.avg.kda).toBe(12);
  });

  it("winRate null quando nenhuma partida tem resultado", () => {
    expect(mostPlayed([m(1, 1, null), m(1, 2, null)])?.avg.winRate).toBeNull();
  });

  it("winRate ignora partida sem resultado", () => {
    expect(mostPlayed([m(1, 1, "W"), m(1, 2, null)])?.avg.winRate).toBe(1);
  });
});

describe("formatDecimal", () => {
  it.each([
    [7.25, 1, "7,3"],
    [6.5, 1, "6,5"],
    [7, 1, "7,0"],
    [412.4, 0, "412"],
  ] as const)("formatDecimal(%s, %s) = %s", (value, digits, expected) => {
    expect(formatDecimal(value, digits)).toBe(expected);
  });
});
