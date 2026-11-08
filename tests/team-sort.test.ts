import { describe, expect, it } from "vitest";
import { nextSort, sortPlayers, teamTotal, type SortKey } from "@/lib/team-sort";

type Row = Record<SortKey, number | null> & { id: string };

function row(id: string, over: Partial<Record<SortKey, number | null>>): Row {
  return {
    id,
    level: 1,
    kills: 0,
    lastHits: 0,
    gpm: 0,
    netWorth: 0,
    heroDamage: 0,
    towerDamage: 0,
    ...over,
  };
}

describe("nextSort", () => {
  it("1º clique: maior primeiro", () => {
    expect(nextSort(null, "gpm")).toEqual({ key: "gpm", dir: "desc" });
  });

  it("2º clique na mesma coluna: menor primeiro", () => {
    expect(nextSort({ key: "gpm", dir: "desc" }, "gpm")).toEqual({ key: "gpm", dir: "asc" });
  });

  it("3º clique: volta à ordem original", () => {
    expect(nextSort({ key: "gpm", dir: "asc" }, "gpm")).toBeNull();
  });

  it("clicar em outra coluna recomeça pelo maior primeiro", () => {
    expect(nextSort({ key: "gpm", dir: "asc" }, "kills")).toEqual({ key: "kills", dir: "desc" });
  });
});

describe("sortPlayers", () => {
  const rows = [
    row("a", { netWorth: 300 }),
    row("b", { netWorth: null }),
    row("c", { netWorth: 500 }),
    row("d", { netWorth: 100 }),
  ];
  const ids = (rs: Row[]) => rs.map((r) => r.id);

  it("desc: maior primeiro, null no fim", () => {
    expect(ids(sortPlayers(rows, { key: "netWorth", dir: "desc" }))).toEqual(["c", "a", "d", "b"]);
  });

  it("asc: menor primeiro, null continua no fim", () => {
    expect(ids(sortPlayers(rows, { key: "netWorth", dir: "asc" }))).toEqual(["d", "a", "c", "b"]);
  });

  it("sem ordenação: ordem original", () => {
    expect(ids(sortPlayers(rows, null))).toEqual(["a", "b", "c", "d"]);
  });

  it("empate mantém a ordem original (estável)", () => {
    const tie = [row("x", { kills: 5 }), row("y", { kills: 9 }), row("z", { kills: 5 })];
    expect(ids(sortPlayers(tie, { key: "kills", dir: "desc" }))).toEqual(["y", "x", "z"]);
    expect(ids(sortPlayers(tie, { key: "kills", dir: "asc" }))).toEqual(["x", "z", "y"]);
  });

  it("não altera a lista recebida", () => {
    const copy = [...rows];
    sortPlayers(rows, { key: "netWorth", dir: "desc" });
    expect(rows).toEqual(copy);
  });
});

describe("teamTotal", () => {
  it("soma o campo do time ignorando valores ausentes", () => {
    const team = [
      row("a", { netWorth: 300 }),
      row("b", { netWorth: null }),
      row("c", { netWorth: 500 }),
    ];
    expect(teamTotal(team, "netWorth")).toBe(800);
  });

  it("time sem nenhum valor: null (mostra —)", () => {
    expect(teamTotal([row("a", { heroDamage: null })], "heroDamage")).toBeNull();
  });
});
