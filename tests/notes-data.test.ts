import { beforeEach, describe, expect, it, vi } from "vitest";

// Cliente da sessão falso: guarda as chamadas e devolve o resultado combinado.
type Call = { method: string; args: unknown[] };
let calls: Call[];
let result: { data: unknown; error: unknown };

function builder() {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "returns", "upsert", "delete"]) {
    b[m] = (...args: unknown[]) => (calls.push({ method: m, args }), b);
  }
  b.maybeSingle = () => Promise.resolve(result);
  b.single = () => Promise.resolve(result);
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => (calls.push({ method: "from", args: [table] }), builder()),
  }),
}));

import { deleteMyNote, getMyNote, getMyNotes, getMyNotesFor, rowToNote, saveMyNote } from "@/lib/notes-data";

const row = {
  match_id: 9086036471,
  hero_id: 7,
  won: false,
  played_at: "2026-11-11T18:25:11+00:00",
  created_at: "2026-11-16T12:00:00+00:00",
  good_tags: ["Lutas em equipe"],
  bad_tags: ["Mortes evitáveis"],
  good_text: "Echo Slam bom",
  bad_text: "morri sozinho",
  missing_items: [{ item_id: 102, reason: "gankado" }, { item_id: "x" }, null],
};

const asNote = {
  matchId: 9086036471,
  heroId: 7,
  won: false,
  playedAt: "2026-11-11T18:25:11+00:00",
  createdAt: "2026-11-16T12:00:00+00:00",
  goodTags: ["Lutas em equipe"],
  badTags: ["Mortes evitáveis"],
  goodText: "Echo Slam bom",
  badText: "morri sozinho",
  missingItems: [{ itemId: 102, reason: "gankado" }],
};

beforeEach(() => {
  calls = [];
  result = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("rowToNote", () => {
  it("converte a linha e descarta itens malformados", () => {
    expect(rowToNote(row as never)).toEqual(asNote);
  });

  it("colunas nulas viram vazias", () => {
    const n = rowToNote({ ...row, good_tags: null, bad_text: null, missing_items: null } as never);
    expect(n.goodTags).toEqual([]);
    expect(n.badText).toBe("");
    expect(n.missingItems).toEqual([]);
  });
});

describe("leituras (o banco filtra pelo dono)", () => {
  it("getMyNote filtra só pela partida", async () => {
    result = { data: row, error: null };
    await expect(getMyNote(9086036471)).resolves.toEqual(asNote);
    expect(calls).toContainEqual({ method: "from", args: ["match_notes"] });
    expect(calls).toContainEqual({ method: "eq", args: ["match_id", 9086036471] });
  });

  it("getMyNotes: mais recentes primeiro, até 2.000", async () => {
    result = { data: [row], error: null };
    await expect(getMyNotes()).resolves.toEqual([asNote]);
    expect(calls).toContainEqual({ method: "order", args: ["played_at", { ascending: false }] });
    expect(calls).toContainEqual({ method: "limit", args: [2000] });
  });

  it("getMyNotesFor devolve um mapa por partida; lista vazia não consulta", async () => {
    result = { data: [row], error: null };
    const map = await getMyNotesFor([9086036471, 1]);
    expect(map.get(9086036471)).toEqual(asNote);
    calls = [];
    expect((await getMyNotesFor([])).size).toBe(0);
    expect(calls).toEqual([]);
  });

  it("erro do banco não lança", async () => {
    result = { data: null, error: { code: "XX", message: "falhou" } };
    await expect(getMyNote(1)).resolves.toBeNull();
    await expect(getMyNotes()).resolves.toEqual([]);
    expect((await getMyNotesFor([1])).size).toBe(0);
    await expect(deleteMyNote(1)).resolves.toBe(false);
  });
});

describe("saveMyNote", () => {
  it("upsert por (user_id, match_id) com os dados da partida e da sessão", async () => {
    result = { data: row, error: null };
    const saved = await saveMyNote(
      "uuid-a",
      217152877,
      { matchId: 9086036471, heroId: 7, won: false, playedAt: "2026-11-11T18:25:11.000Z" },
      {
        goodTags: ["Lutas em equipe"],
        badTags: ["Mortes evitáveis"],
        goodText: "Echo Slam bom",
        badText: "morri sozinho",
        missingItems: [{ itemId: 102, reason: "gankado" }],
      },
    );
    expect(saved).toEqual(asNote);
    const upsert = calls.find((c) => c.method === "upsert")!;
    expect(upsert.args[0]).toMatchObject({
      user_id: "uuid-a",
      match_id: 9086036471,
      account_id: 217152877,
      hero_id: 7,
      won: false,
      missing_items: [{ item_id: 102, reason: "gankado" }],
    });
    expect(upsert.args[1]).toEqual({ onConflict: "user_id,match_id" });
  });

  it("erro do banco: null", async () => {
    result = { data: null, error: { code: "42501", message: "rls" } };
    await expect(
      saveMyNote("u", 1, { matchId: 1, heroId: 1, won: null, playedAt: "x" }, {
        goodTags: [],
        badTags: [],
        goodText: "a",
        badText: "",
        missingItems: [],
      }),
    ).resolves.toBeNull();
  });
});

describe("deleteMyNote", () => {
  it("apaga pela partida", async () => {
    await expect(deleteMyNote(5)).resolves.toBe(true);
    expect(calls).toContainEqual({ method: "eq", args: ["match_id", 5] });
  });
});
