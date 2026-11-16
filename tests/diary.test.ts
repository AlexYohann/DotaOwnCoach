import { describe, expect, it } from "vitest";
import {
  canonicalTag,
  DEFAULT_TAGS,
  heroOptions,
  knownTags,
  normalizeTag,
  parseDiaryFilter,
  parseNoteInput,
  selectNotes,
  summarize,
  tagKey,
  type Note,
} from "@/lib/diary";

const NOW = Date.parse("2026-11-16T15:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

let seq = 0;
function note(over: Partial<Note> = {}): Note {
  seq += 1;
  return {
    matchId: 1000 + seq,
    heroId: 7,
    won: true,
    playedAt: iso(NOW - DAY),
    createdAt: iso(NOW - DAY + seq),
    goodTags: [],
    badTags: [],
    goodText: "",
    badText: "",
    missingItems: [],
    ...over,
  };
}

describe("etiquetas", () => {
  it("normalizeTag apara, colapsa espaços e limita a 30", () => {
    expect(normalizeTag("  lane   ruim ")).toBe("lane ruim");
    expect(normalizeTag("   ")).toBeNull();
    expect(normalizeTag("x".repeat(30))).toBe("x".repeat(30));
    expect(normalizeTag("x".repeat(31))).toBeNull();
  });

  it("tagKey ignora maiúsculas e acentos", () => {
    expect(tagKey("Mortes Evitáveis")).toBe(tagKey("mortes evitaveis"));
    expect(tagKey("Visão")).toBe("visao");
  });

  it("canonicalTag: fixas vencem, depois a grafia já usada", () => {
    expect(canonicalTag("mortes evitaveis", [])).toBe("Mortes evitáveis");
    expect(canonicalTag("LANE ruim", ["Lane ruim"])).toBe("Lane ruim");
    expect(canonicalTag("tilt", ["Lane ruim"])).toBe("tilt");
  });

  it("knownTags: próprias, distintas, na ordem em que foram criadas", () => {
    const notes = [
      note({ createdAt: iso(NOW - 2 * DAY), badTags: ["Lane ruim", "Farm"] }),
      note({ createdAt: iso(NOW - 3 * DAY), goodTags: ["Smoke bem feita"] }),
      note({ createdAt: iso(NOW - DAY), badTags: ["lane RUIM", "Tilt"] }),
    ];
    expect(knownTags(notes)).toEqual(["Smoke bem feita", "Lane ruim", "Tilt"]);
  });

  it("a lista fixa tem as 8 etiquetas do design", () => {
    expect(DEFAULT_TAGS).toEqual([
      "Fase de rotas",
      "Farm",
      "Mortes evitáveis",
      "Posicionamento",
      "Lutas em equipe",
      "Visão",
      "Objetivos",
      "Rotações",
    ]);
  });
});

describe("parseNoteInput", () => {
  const ctx = { itemIds: new Set([116, 102]), known: ["Lane ruim"] };
  const ok = (raw: unknown) => {
    const r = parseNoteInput(raw, ctx);
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  it("normaliza, aplica a grafia existente e tira repetidas", () => {
    const r = ok({
      goodTags: ["lutas em equipe", "Lutas em Equipe"],
      badTags: [" lane  ruim "],
      goodText: "  Echo Slam bom  ",
      badText: "",
      missingItems: [{ itemId: 102, reason: " gankado sozinho " }],
    });
    expect(r.empty).toBe(false);
    expect(r.note).toEqual({
      goodTags: ["Lutas em equipe"],
      badTags: ["Lane ruim"],
      goodText: "Echo Slam bom",
      badText: "",
      missingItems: [{ itemId: 102, reason: "gankado sozinho" }],
    });
  });

  it("mesma etiqueta nos dois lados: fica só em deu errado", () => {
    const r = ok({ goodTags: ["Farm", "Visão"], badTags: ["farm"] });
    expect(r.note.goodTags).toEqual(["Visão"]);
    expect(r.note.badTags).toEqual(["Farm"]);
  });

  it("campos ausentes viram vazios; tudo vazio = empty", () => {
    const r = ok({});
    expect(r.empty).toBe(true);
    expect(r.note).toEqual({ goodTags: [], badTags: [], goodText: "", badText: "", missingItems: [] });
  });

  it("item repetido conta uma vez", () => {
    const r = ok({ missingItems: [{ itemId: 116, reason: "a" }, { itemId: 116, reason: "b" }] });
    expect(r.note.missingItems).toEqual([{ itemId: 116, reason: "a" }]);
  });

  it.each([
    ["corpo que não é objeto", null],
    ["lista em vez de objeto", []],
    ["etiquetas que não são lista", { goodTags: "Farm" }],
    ["etiqueta que não é texto", { badTags: [3] }],
    ["etiqueta longa demais", { badTags: ["x".repeat(31)] }],
    ["13 etiquetas", { badTags: Array.from({ length: 13 }, (_, i) => `t${i}`) }],
    ["texto com 2.001 caracteres", { goodText: "a".repeat(2001) }],
    ["texto que não é texto", { badText: 5 }],
    ["7 itens", { missingItems: Array.from({ length: 7 }, (_, i) => ({ itemId: i + 1, reason: "" })) }],
    ["item que não existe", { missingItems: [{ itemId: 999, reason: "" }] }],
    ["item sem ID numérico", { missingItems: [{ itemId: "102", reason: "" }] }],
    ["motivo com 301 caracteres", { missingItems: [{ itemId: 102, reason: "a".repeat(301) }] }],
  ])("recusa %s", (_label, raw) => {
    const r = parseNoteInput(raw, ctx);
    expect(r.ok).toBe(false);
  });

  it("aceita os limites exatos", () => {
    const r = parseNoteInput(
      {
        badTags: Array.from({ length: 12 }, (_, i) => `t${i}`),
        goodText: "a".repeat(2000),
        missingItems: [{ itemId: 102, reason: "a".repeat(300) }],
      },
      ctx,
    );
    expect(r.ok).toBe(true);
  });
});

describe("parseDiaryFilter", () => {
  it("padrão: 30 dias, todos os heróis, sem partidas escolhidas", () => {
    expect(parseDiaryFilter({})).toEqual({ period: 30, heroId: null, matchIds: null });
  });

  it("lê período, herói e partidas", () => {
    expect(parseDiaryFilter({ periodo: "tudo", heroi: "7", partidas: "3,1,3,x,2" })).toEqual({
      period: "tudo",
      heroId: 7,
      matchIds: [3, 1, 2],
    });
    expect(parseDiaryFilter({ periodo: "7" }).period).toBe(7);
    expect(parseDiaryFilter({ periodo: "90" }).period).toBe(90);
  });

  it("valor inválido volta ao padrão; no máximo 100 partidas", () => {
    expect(parseDiaryFilter({ periodo: "15", heroi: "-1", partidas: "" })).toEqual({
      period: 30,
      heroId: null,
      matchIds: null,
    });
    const many = Array.from({ length: 150 }, (_, i) => i + 1).join(",");
    expect(parseDiaryFilter({ partidas: many }).matchIds).toHaveLength(100);
    expect(parseDiaryFilter({ periodo: ["7", "90"] }).period).toBe(7);
  });
});

describe("selectNotes", () => {
  it("30 dias: atual = últimos 30, anterior = 30 a 60", () => {
    const n29 = note({ playedAt: iso(NOW - 29 * DAY) });
    const n31 = note({ playedAt: iso(NOW - 31 * DAY) });
    const n61 = note({ playedAt: iso(NOW - 61 * DAY) });
    const { current, previous } = selectNotes([n29, n31, n61], { period: 30, heroId: null, matchIds: null }, NOW);
    expect(current).toEqual([n29]);
    expect(previous).toEqual([n31]);
  });

  it("herói filtra os dois períodos", () => {
    const es = note({ heroId: 7, playedAt: iso(NOW - 2 * DAY) });
    const other = note({ heroId: 1, playedAt: iso(NOW - 2 * DAY) });
    const esOld = note({ heroId: 7, playedAt: iso(NOW - 40 * DAY) });
    const otherOld = note({ heroId: 1, playedAt: iso(NOW - 40 * DAY) });
    const r = selectNotes([es, other, esOld, otherOld], { period: 30, heroId: 7, matchIds: null }, NOW);
    expect(r.current).toEqual([es]);
    expect(r.previous).toEqual([esOld]);
  });

  it("partidas escolhidas ignoram período e herói e não têm anterior", () => {
    const old = note({ heroId: 1, playedAt: iso(NOW - 400 * DAY) });
    const recent = note();
    const r = selectNotes([old, recent], { period: 7, heroId: 7, matchIds: [old.matchId] }, NOW);
    expect(r.current).toEqual([old]);
    expect(r.previous).toBeNull();
  });

  it("tudo: todas as notas, sem anterior", () => {
    const a = note({ playedAt: iso(NOW - 900 * DAY) });
    const r = selectNotes([a], { period: "tudo", heroId: null, matchIds: null }, NOW);
    expect(r.current).toEqual([a]);
    expect(r.previous).toBeNull();
  });
});

describe("summarize", () => {
  it("conta etiquetas por lado, vitórias e ordena pela contagem", () => {
    const notes = [
      note({ won: false, badTags: ["Mortes evitáveis", "Farm"], badText: "morri sozinho", playedAt: iso(NOW - 3 * DAY) }),
      note({ won: true, badTags: ["Mortes evitáveis"], goodTags: ["Lutas em equipe"], playedAt: iso(NOW - 2 * DAY) }),
      note({ won: null, badTags: ["Mortes evitáveis"], badText: "sem visão", playedAt: iso(NOW - DAY) }),
    ];
    const s = summarize(notes, null);
    expect(s).toMatchObject({ total: 3, wins: 1, losses: 1 });
    expect(s.bad.map((t) => [t.tag, t.count, t.wins, t.decided])).toEqual([
      ["Mortes evitáveis", 3, 1, 2],
      ["Farm", 1, 0, 1],
    ]);
    expect(s.good.map((t) => t.tag)).toEqual(["Lutas em equipe"]);
    // textos daquele lado, do mais recente para o mais antigo; vazios fora
    expect(s.bad[0].texts.map((t) => t.text)).toEqual(["sem visão", "morri sozinho"]);
    expect(s.bad[0].trend).toBeNull();
    expect(s.bad[0].before).toBeNull();
  });

  it("empate na contagem: a mais recente primeiro", () => {
    const s = summarize(
      [
        note({ badTags: ["Farm"], playedAt: iso(NOW - 5 * DAY) }),
        note({ badTags: ["Visão"], playedAt: iso(NOW - DAY) }),
      ],
      null,
    );
    expect(s.bad.map((t) => t.tag)).toEqual(["Visão", "Farm"]);
  });

  const withTag = (n: number, total: number, tag: string) =>
    Array.from({ length: total }, (_, i) => note({ badTags: i < n ? [tag] : ["Outra"] }));

  it("seta pela fração, com tolerância de 5 pontos", () => {
    const down = summarize(withTag(12, 24, "Mortes evitáveis"), withTag(18, 26, "Mortes evitáveis"));
    const t = down.bad.find((x) => x.tag === "Mortes evitáveis")!;
    expect(t.trend).toBe("down");
    expect(t.before).toEqual({ count: 18, total: 26 });

    const same = summarize(withTag(5, 24, "Farm"), withTag(5, 26, "Farm"));
    expect(same.bad.find((x) => x.tag === "Farm")!.trend).toBe("same");

    const up = summarize(withTag(8, 24, "Posicionamento"), withTag(4, 26, "Posicionamento"));
    expect(up.bad.find((x) => x.tag === "Posicionamento")!.trend).toBe("up");
  });

  it("etiqueta que não aparecia antes: novo; anterior com menos de 3 notas: sem seta", () => {
    const novo = summarize([note({ goodTags: ["Rotações"] })], withTag(0, 5, "x"));
    expect(novo.good[0].trend).toBe("new");
    expect(novo.good[0].before).toEqual({ count: 0, total: 5 });

    const pouco = summarize([note({ goodTags: ["Rotações"] })], [note(), note()]);
    expect(pouco.good[0].trend).toBeNull();
  });

  it("itens que mais faltaram, com os motivos", () => {
    const s = summarize(
      [
        note({ missingItems: [{ itemId: 102, reason: "gankado" }], playedAt: iso(NOW - 3 * DAY) }),
        note({ missingItems: [{ itemId: 102, reason: "" }, { itemId: 116, reason: "controle" }], playedAt: iso(NOW - DAY) }),
      ],
      null,
    );
    expect(s.items).toEqual([
      { itemId: 102, count: 2, reasons: ["gankado"] },
      { itemId: 116, count: 1, reasons: ["controle"] },
    ]);
  });

  it("sem notas: tudo zerado", () => {
    expect(summarize([], null)).toEqual({ total: 0, wins: 0, losses: 0, good: [], bad: [], items: [] });
  });
});

describe("heroOptions", () => {
  it("heróis com nota, mais notas primeiro", () => {
    expect(heroOptions([note({ heroId: 7 }), note({ heroId: 1 }), note({ heroId: 7 })])).toEqual([
      { heroId: 7, count: 2 },
      { heroId: 1, count: 1 },
    ]);
  });
});
