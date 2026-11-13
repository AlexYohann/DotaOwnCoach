import { describe, expect, it } from "vitest";
import {
  cleanQuery,
  currentRoster,
  featuredTeams,
  lastPlayedLabel,
  normalizeNick,
  pickExample,
  safeLogoUrl,
  submitTarget,
  type ProSuggestion,
} from "@/lib/pros";

describe("normalizeNick", () => {
  it("tira símbolos, acentos e maiúsculas", () => {
    expect(normalizeNick("Miracle-")).toBe("miracle");
    expect(normalizeNick("No[o]ne-")).toBe("noone");
    expect(normalizeNick("Sákura")).toBe("sakura");
  });

  it("mantém letras de outros alfabetos", () => {
    expect(normalizeNick("天鸽")).toBe("天鸽");
    expect(normalizeNick("ряф^^")).toBe("ряф");
  });

  it("nick só de símbolos vira vazio", () => {
    expect(normalizeNick("-_- ")).toBe("");
  });
});

describe("cleanQuery", () => {
  it("normaliza o que foi digitado", () => {
    expect(cleanQuery("Yat")).toBe("yat");
    expect(cleanQuery("33")).toBe("33"); // nick numérico existe
  });

  it("recusa menos de 2 caracteres úteis", () => {
    expect(cleanQuery(" y ")).toBeNull();
    expect(cleanQuery(null)).toBeNull();
    expect(cleanQuery("")).toBeNull();
  });

  it("recusa só símbolos e curingas de SQL", () => {
    expect(cleanQuery("%%")).toBeNull();
    expect(cleanQuery("__")).toBeNull();
    expect(cleanQuery("-")).toBeNull();
  });

  it("recusa texto com mais de 32 caracteres", () => {
    expect(cleanQuery("a".repeat(33))).toBeNull();
    expect(cleanQuery("a".repeat(32))).toBe("a".repeat(32));
  });
});

describe("featuredTeams", () => {
  const NOW = Date.UTC(2026, 10, 12, 12);
  const daysAgo = (d: number) => Math.floor(NOW / 1000) - d * 86400;
  const team = (team_id: number, rating: number, last: number | null) => ({
    team_id,
    rating,
    last_match_time: last,
  });

  it("os 6 de maior rating entre os que jogaram nos últimos 60 dias", () => {
    const teams = [
      team(1, 2000, daysAgo(61)), // parado: fora, apesar do rating
      team(2, 1900, null), // sem data: fora
      ...[3, 4, 5, 6, 7, 8, 9, 10].map((id) => team(id, 1500 - id, daysAgo(id))),
    ];
    const out = featuredTeams(teams, NOW);
    expect(out.map((t) => t.team_id)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it("ordena por rating mesmo se a lista vier fora de ordem", () => {
    const out = featuredTeams(
      [team(1, 1000, daysAgo(1)), team(2, 1400, daysAgo(59)), team(3, 1200, daysAgo(2))],
      NOW,
    );
    expect(out.map((t) => t.team_id)).toEqual([2, 3, 1]);
  });
});

describe("currentRoster", () => {
  const m = (
    account_id: number,
    name: string | null,
    games_played: number,
    current: boolean | null,
  ) => ({ account_id, name, games_played, is_current_team_member: current });

  it("só membros atuais, por partidas jogadas, sem limite de 5", () => {
    const out = currentRoster([
      m(1, "a", 10, true),
      m(2, "b", 300, true),
      m(3, "ex", 900, false),
      m(4, "c", 50, true),
      m(5, "d", 40, true),
      m(6, "e", 30, true),
      m(7, "f", 20, true),
      m(8, "nulo", 5, null),
    ]);
    expect(out.map((p) => p.account_id)).toEqual([2, 4, 5, 6, 7, 1]);
    expect(out[0]).toEqual({ account_id: 2, name: "b" });
  });

  it("descarta membro sem nome", () => {
    expect(currentRoster([m(1, null, 10, true), m(2, "  ", 9, true), m(3, "ok", 1, true)])).toEqual([
      { account_id: 3, name: "ok" },
    ]);
  });
});

describe("pickExample", () => {
  it("sem candidato devolve null", () => {
    expect(pickExample([], () => 0.5)).toBeNull();
  });

  it("escolhe pelo sorteio, nas duas pontas", () => {
    expect(pickExample([10, 20, 30], () => 0)).toBe(10);
    expect(pickExample([10, 20, 30], () => 0.999)).toBe(30);
  });
});

describe("lastPlayedLabel", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");

  it("hoje, ontem e dias", () => {
    expect(lastPlayedLabel("2026-11-12T03:00:00Z", now)).toBe("jogou hoje");
    expect(lastPlayedLabel("2026-11-11T10:00:00Z", now)).toBe("jogou ontem");
    expect(lastPlayedLabel("2026-11-01T12:00:00Z", now)).toBe("jogou há 11 dias");
  });

  it("meses e mais de um ano", () => {
    expect(lastPlayedLabel("2026-08-12T12:00:00Z", now)).toBe("jogou há 3 meses");
    expect(lastPlayedLabel("2026-10-10T12:00:00Z", now)).toBe("jogou há 1 mês");
    expect(lastPlayedLabel("2025-01-20T12:00:00Z", now)).toBe("jogou há mais de um ano");
  });

  it("sem data ou data inválida", () => {
    expect(lastPlayedLabel(null, now)).toBe("sem partidas recentes");
    expect(lastPlayedLabel("lixo", now)).toBe("sem partidas recentes");
  });
});

describe("safeLogoUrl", () => {
  it("aceita só https", () => {
    expect(safeLogoUrl("https://cdn.steamusercontent.com/ugc/1/A/")).toBe(
      "https://cdn.steamusercontent.com/ugc/1/A/",
    );
    expect(safeLogoUrl("http://x.com/a.png")).toBeNull();
    expect(safeLogoUrl("javascript:alert(1)")).toBeNull();
    expect(safeLogoUrl("")).toBeNull();
    expect(safeLogoUrl(null)).toBeNull();
    expect(safeLogoUrl(undefined)).toBeNull();
  });
});

describe("submitTarget", () => {
  const pro = (accountId: number): ProSuggestion => ({
    accountId,
    name: "x",
    avatar: null,
    teamName: null,
    teamTag: null,
    teamLogo: null,
    lastMatchTime: null,
    verified: true,
  });

  it("só dígitos e nada escolhido → busca por ID", () => {
    expect(submitTarget("105248644", null, pro(1))).toBe("/player/105248644");
    expect(submitTarget(" 105248644 ", null, null)).toBe("/player/105248644");
  });

  it("sugestão escolhida com as setas vence, mesmo com dígitos", () => {
    expect(submitTarget("33", pro(86698277), pro(86698277))).toBe("/player/86698277");
  });

  it("texto → primeira sugestão", () => {
    expect(submitTarget("yat", null, pro(321580662))).toBe("/player/321580662");
  });

  it("texto sem sugestão ou vazio → nada", () => {
    expect(submitTarget("zzzz", null, null)).toBeNull();
    expect(submitTarget("  ", null, null)).toBeNull();
  });
});
