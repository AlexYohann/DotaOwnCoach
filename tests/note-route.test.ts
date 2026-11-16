import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/lib/diary";

// A rota decide quem é o autor (sessão), se a pessoa jogou a partida e o que
// é gravado. Sessão, partida, itens e banco são dublês.

vi.mock("@/lib/account", () => ({ getViewerSession: vi.fn() }));
vi.mock("@/lib/data", () => ({ getMatchData: vi.fn(), getItems: vi.fn() }));
vi.mock("@/lib/notes-data", () => ({
  getMyTagNotes: vi.fn(),
  saveMyNote: vi.fn(),
  deleteMyNote: vi.fn(),
}));

import * as account from "@/lib/account";
import * as data from "@/lib/data";
import * as notes from "@/lib/notes-data";
import { OpenDotaError } from "@/lib/opendota";
import { DELETE, PUT } from "@/app/match/[id]/note/route";

const session = vi.mocked(account.getViewerSession);
const getMatch = vi.mocked(data.getMatchData);
const getItems = vi.mocked(data.getItems);
const getMyTagNotes = vi.mocked(notes.getMyTagNotes);
const save = vi.mocked(notes.saveMyNote);
const del = vi.mocked(notes.deleteMyNote);

const ME = 217152877;
const MATCH = 9086036471;

const match = (radiantWin: boolean | null = false) =>
  ({
    match_id: MATCH,
    start_time: 1794336311,
    radiant_win: radiantWin,
    players: [
      { account_id: ME, player_slot: 2, hero_id: 7 },
      { account_id: 111, player_slot: 130, hero_id: 1 },
    ],
  }) as never;

const put = (body: unknown, id = String(MATCH)) =>
  PUT(
    new Request("http://localhost/match/x/note", {
      method: "PUT",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id }) },
  );

const remove = (id = String(MATCH)) => DELETE(undefined as never, { params: Promise.resolve({ id }) });

const savedNote = { matchId: MATCH } as Note;

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ userId: "uuid-a", accountId: ME });
  getMatch.mockResolvedValue(match());
  getItems.mockResolvedValue({ 102: {} as never, 116: {} as never });
  getMyTagNotes.mockResolvedValue([]);
  save.mockResolvedValue(savedNote);
  del.mockResolvedValue(true);
});

describe("PUT /match/[id]/note", () => {
  it("salva com o autor da sessão e os dados da partida", async () => {
    const res = await put({ badTags: ["mortes evitaveis"], badText: "morri", account_id: 999, userId: "uuid-b" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(save).toHaveBeenCalledWith(
      "uuid-a",
      ME, // a conta do corpo (999) é ignorada
      { matchId: MATCH, heroId: 7, won: false, playedAt: new Date(1794336311 * 1000).toISOString() },
      { goodTags: [], badTags: ["Mortes evitáveis"], goodText: "", badText: "morri", missingItems: [] },
    );
    expect(await res.json()).toEqual({ note: savedNote });
  });

  it("resultado indefinido vira won null", async () => {
    getMatch.mockResolvedValue(match(null));
    await put({ goodText: "x" });
    expect(save.mock.calls[0][2].won).toBeNull();
  });

  it("etiqueta digitada ganha a grafia que o usuário já usa", async () => {
    getMyTagNotes.mockResolvedValue([
      { goodTags: ["Smoke bem feita"], badTags: [], createdAt: "2026-11-01T00:00:00Z" } as unknown as Note,
    ]);
    await put({ goodTags: ["SMOKE bem  feita"] });
    expect(save.mock.calls[0][3].goodTags).toEqual(["Smoke bem feita"]);
  });

  it("sem sessão: 401 sem tocar em nada", async () => {
    session.mockResolvedValue(null);
    expect((await put({ goodText: "x" })).status).toBe(401);
    expect(getMatch).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("partida em que a pessoa não jogou: 403", async () => {
    session.mockResolvedValue({ userId: "uuid-b", accountId: 555 });
    expect((await put({ goodText: "x" })).status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it("ID inválido: 400; partida inexistente: 404; OpenDota fora: 503", async () => {
    expect((await put({}, "abc")).status).toBe(400);
    getMatch.mockResolvedValue(null);
    expect((await put({ goodText: "x" })).status).toBe(404);
    getMatch.mockRejectedValue(new OpenDotaError("unavailable", "x"));
    expect((await put({ goodText: "x" })).status).toBe(503);
  });

  it("corpo que não é JSON ou nota inválida: 400 com a mensagem", async () => {
    expect((await put("{nao json")).status).toBe(400);
    const res = await put({ goodText: "a".repeat(2001) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/2000/);
    expect((await put({ missingItems: [{ itemId: 999, reason: "" }] })).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("nota vazia apaga", async () => {
    const res = await put({ goodTags: [], goodText: "   " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ note: null });
    expect(del).toHaveBeenCalledWith(MATCH);
    expect(save).not.toHaveBeenCalled();
  });

  it("banco falhou: 500", async () => {
    save.mockResolvedValue(null);
    expect((await put({ goodText: "x" })).status).toBe(500);
  });
});

describe("leitura das etiquetas já usadas", () => {
  it("só acontece se a nota trouxer etiqueta fora da lista fixa", async () => {
    await put({ badTags: ["Mortes evitáveis", "farm"] });
    expect(getMyTagNotes).not.toHaveBeenCalled();
    await put({ badTags: ["Tilt"] });
    expect(getMyTagNotes).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /match/[id]/note", () => {
  it("apaga a nota de quem está logado", async () => {
    const res = await remove();
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith(MATCH);
  });

  it("sem sessão: 401; ID inválido: 400; banco falhou: 500", async () => {
    session.mockResolvedValue(null);
    expect((await remove()).status).toBe(401);
    session.mockResolvedValue({ userId: "u", accountId: ME });
    expect((await remove("1e5")).status).toBe(400);
    del.mockResolvedValue(false);
    expect((await remove()).status).toBe(500);
  });
});
