import { describe, expect, it } from "vitest";
import {
  nextSort,
  readTeamMode,
  saveTeamMode,
  sortPlayers,
  teamTotal,
  visibleSort,
  type SortKey,
} from "@/lib/team-sort";

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

describe("visibleSort", () => {
  it("modo completo: vale a ordenação escolhida", () => {
    expect(visibleSort("full", { key: "netWorth", dir: "desc" })).toEqual({ key: "netWorth", dir: "desc" });
  });

  it("lado a lado: só K/D/A aparece; outra coluna não ordena escondida", () => {
    expect(visibleSort("compact", { key: "netWorth", dir: "desc" })).toBeNull();
    expect(visibleSort("compact", { key: "kills", dir: "asc" })).toEqual({ key: "kills", dir: "asc" });
  });
});

describe("readTeamMode / saveTeamMode", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const broken = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };

  it("sem preferência ou valor inválido: completo", () => {
    const s = mem();
    expect(readTeamMode(s)).toBe("full");
    s.setItem("dota-own-coach:team-mode", "xyz");
    expect(readTeamMode(s)).toBe("full");
  });

  it("guarda e lê a preferência", () => {
    const s = mem();
    saveTeamMode(s, "compact");
    expect(readTeamMode(s)).toBe("compact");
  });

  it("armazenamento bloqueado (navegação privada) não lança", () => {
    expect(readTeamMode(broken)).toBe("full");
    expect(() => saveTeamMode(broken, "compact")).not.toThrow();
  });
});

describe("sem acesso ao localStorage (o próprio acesso lançou)", () => {
  it("null: lê completo e salvar não faz nada", () => {
    expect(readTeamMode(null)).toBe("full");
    expect(() => saveTeamMode(null, "compact")).not.toThrow();
  });
});
