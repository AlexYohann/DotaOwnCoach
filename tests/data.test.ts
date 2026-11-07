import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Dublês: after() do Next, Supabase e OpenDota.

// after() guarda o callback; o teste decide quando "a resposta terminou".
const afterQueue: (() => unknown)[] = [];
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => afterQueue.push(cb),
}));
async function flushAfter() {
  while (afterQueue.length) await afterQueue.shift()!();
}

type DbResult = { data: unknown; error: unknown };
let reads: Record<string, DbResult>;
let writes: { table: string; rows: unknown; opts?: unknown }[];
let adminEnabled: boolean;

// Query builder encadeável: o resultado depende só da tabela.
function readBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) b[m] = () => b;
  // Como o Supabase real: sem linhas, lista vem [] e maybeSingle vem null.
  b.maybeSingle = () => Promise.resolve(reads[table] ?? { data: null, error: null });
  b.returns = () => Promise.resolve(reads[table] ?? { data: [], error: null });
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createReadClient: () => ({ from: readBuilder }),
  createAdminClient: () =>
    adminEnabled
      ? {
          from: (table: string) => ({
            upsert: (rows: unknown, opts?: unknown) => {
              writes.push({ table, rows, opts });
              return Promise.resolve({ error: null });
            },
          }),
        }
      : null,
}));

vi.mock("@/lib/opendota", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/opendota")>();
  return {
    OpenDotaError: real.OpenDotaError, // a classe real: data.ts usa instanceof
    getPlayer: vi.fn(),
    getRecentMatches: vi.fn(),
    getMatch: vi.fn(),
    getHeroesFromApi: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ cacheLife: () => {} }));

import * as od from "@/lib/opendota";
import { getHeroes, getMatchData, getPlayerData } from "@/lib/data";

const api = vi.mocked(od);

// ---------------------------------------------------------------------------
// Dados de exemplo

const NOW = new Date().toISOString();
const HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const playerRow = (fetched_at: string) => ({
  account_id: 7,
  personaname: "salvo",
  avatar: "a.png",
  profile_url: "p",
  fetched_at,
});

const pmRow = {
  match_id: 100,
  start_time: "2026-11-06T21:42:00.000Z",
  player_slot: 130,
  hero_id: 1,
  kills: 1,
  deaths: 2,
  assists: 3,
  gold_per_min: 400,
  xp_per_min: 500,
  last_hits: 60,
  matches: { radiant_win: false, duration: 1800 },
};

const apiProfile = {
  account_id: 7,
  personaname: "da api",
  avatarmedium: "b.png",
  profileurl: "q",
};
const apiMatch = {
  match_id: 200,
  player_slot: 0,
  radiant_win: true,
  hero_id: 2,
  start_time: 1_780_000_000,
  duration: 2000,
  kills: 9,
  deaths: 0,
  assists: 9,
  gold_per_min: 800,
  xp_per_min: 900,
  last_hits: 300,
};

beforeEach(() => {
  reads = {};
  writes = [];
  adminEnabled = true;
  afterQueue.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(api.getPlayer).mockReset();
  vi.mocked(api.getRecentMatches).mockReset();
  vi.mocked(api.getMatch).mockReset();
  vi.mocked(api.getHeroesFromApi).mockReset();
});

// ---------------------------------------------------------------------------

describe("getPlayerData", () => {
  it("dado com menos de 10 min: vem do banco, sem chamar a OpenDota", async () => {
    reads.players = { data: playerRow(NOW), error: null };
    reads.player_matches = { data: [pmRow], error: null };

    const r = await getPlayerData(7);

    expect(api.getPlayer).not.toHaveBeenCalled();
    expect(api.getRecentMatches).not.toHaveBeenCalled();
    expect(r?.freshness.source).toBe("db");
    expect(r?.profile).toEqual({
      account_id: 7,
      personaname: "salvo",
      avatarmedium: "a.png",
      profileurl: "p",
    });
    // Linha do banco volta no formato da API (start_time unix, radiant_win do join).
    expect(r?.matches[0]).toMatchObject({
      match_id: 100,
      radiant_win: false,
      duration: 1800,
      start_time: Date.UTC(2026, 10, 6, 21, 42) / 1000,
    });
    expect(afterQueue).toHaveLength(0); // nada a gravar
  });

  it("dado vencido: busca na OpenDota e grava só depois de responder", async () => {
    reads.players = { data: playerRow(HOUR_AGO), error: null };
    reads.player_matches = { data: [pmRow], error: null };
    api.getPlayer.mockResolvedValue(apiProfile);
    api.getRecentMatches.mockResolvedValue([apiMatch]);

    const r = await getPlayerData(7);

    expect(r?.freshness.source).toBe("api");
    expect(r?.matches).toEqual([apiMatch]);
    expect(writes).toHaveLength(0); // a página não esperou a gravação

    await flushAfter();
    // Ordem obrigatória por causa das FKs: players → matches → player_matches.
    expect(writes.map((w) => w.table)).toEqual([
      "players",
      "matches",
      "player_matches",
    ]);
    // Partida já salva (talvez com detail) não é sobrescrita.
    expect(writes[1].opts).toMatchObject({ ignoreDuplicates: true });
    expect(writes[2].rows).toEqual([
      expect.objectContaining({
        account_id: 7,
        match_id: 200,
        start_time: new Date(1_780_000_000 * 1000).toISOString(),
      }),
    ]);
  });

  it("jogador nunca visto: busca na API", async () => {
    reads.players = { data: null, error: null };
    reads.player_matches = { data: [], error: null };
    api.getPlayer.mockResolvedValue(apiProfile);
    api.getRecentMatches.mockResolvedValue([]);

    const r = await getPlayerData(7);
    expect(r?.freshness.source).toBe("api");

    await flushAfter();
    expect(writes.map((w) => w.table)).toEqual(["players"]); // sem partidas
  });

  it("jogador inexistente na OpenDota: null e nada gravado", async () => {
    api.getPlayer.mockResolvedValue(null);
    api.getRecentMatches.mockResolvedValue([]);

    await expect(getPlayerData(7)).resolves.toBeNull();
    expect(afterQueue).toHaveLength(0);
  });

  it("OpenDota fora com dado salvo: mostra o dado antigo (stale)", async () => {
    reads.players = { data: playerRow(HOUR_AGO), error: null };
    reads.player_matches = { data: [pmRow], error: null };
    api.getPlayer.mockRejectedValue(new od.OpenDotaError("unavailable", "x"));
    api.getRecentMatches.mockResolvedValue([]);

    const r = await getPlayerData(7);

    expect(r?.freshness.source).toBe("stale");
    expect(r?.freshness.fetchedAt.toISOString()).toBe(HOUR_AGO);
    expect(r?.matches[0].match_id).toBe(100);
  });

  it("OpenDota fora sem dado salvo: repassa o erro (página mostra a mensagem)", async () => {
    api.getPlayer.mockRejectedValue(new od.OpenDotaError("rate_limit", "429"));
    api.getRecentMatches.mockResolvedValue([]);

    await expect(getPlayerData(7)).rejects.toMatchObject({ kind: "rate_limit" });
  });

  it("erro que não é da OpenDota não vira stale", async () => {
    reads.players = { data: playerRow(HOUR_AGO), error: null };
    reads.player_matches = { data: [pmRow], error: null };
    api.getPlayer.mockRejectedValue(new Error("bug"));
    api.getRecentMatches.mockResolvedValue([]);

    await expect(getPlayerData(7)).rejects.toThrow("bug");
  });

  it("banco fora: cai no modo só-API", async () => {
    reads.players = { data: null, error: { code: "PGRST205", message: "x" } };
    reads.player_matches = { data: null, error: { code: "PGRST205", message: "x" } };
    api.getPlayer.mockResolvedValue(apiProfile);
    api.getRecentMatches.mockResolvedValue([apiMatch]);

    const r = await getPlayerData(7);
    expect(r?.freshness.source).toBe("api");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("PGRST205"));
  });

  it("perfil fresco mas leitura das partidas falhou: busca na API", async () => {
    reads.players = { data: playerRow(NOW), error: null };
    reads.player_matches = { data: null, error: { code: "500", message: "x" } };
    api.getPlayer.mockResolvedValue(apiProfile);
    api.getRecentMatches.mockResolvedValue([apiMatch]);

    const r = await getPlayerData(7);
    expect(r?.freshness.source).toBe("api");
  });

  it("sem SUPABASE_SECRET_KEY: funciona, mas não grava", async () => {
    adminEnabled = false;
    api.getPlayer.mockResolvedValue(apiProfile);
    api.getRecentMatches.mockResolvedValue([apiMatch]);

    await getPlayerData(7);
    await flushAfter();
    expect(writes).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("SUPABASE_SECRET_KEY"),
    );
  });
});

describe("getMatchData", () => {
  const detail = { match_id: 100, start_time: 1000, duration: 1800, players: [] };

  it("detail salvo na versão atual: não chama a OpenDota", async () => {
    reads.matches = { data: { detail: { version: 1, match: detail } }, error: null };

    await expect(getMatchData(100)).resolves.toEqual(detail);
    expect(api.getMatch).not.toHaveBeenCalled();
  });

  it("detail de versão antiga: busca de novo e grava com a versão atual", async () => {
    reads.matches = { data: { detail: { version: 0, match: {} } }, error: null };
    api.getMatch.mockResolvedValue(detail as never);

    await expect(getMatchData(100)).resolves.toEqual(detail);
    expect(writes).toHaveLength(0);

    await flushAfter();
    expect(writes[0].table).toBe("matches");
    expect(writes[0].rows).toMatchObject({
      match_id: 100,
      detail: { version: 1, match: detail },
    });
  });

  it("partida inexistente: null e nada gravado", async () => {
    api.getMatch.mockResolvedValue(null);
    await expect(getMatchData(1)).resolves.toBeNull();
    expect(afterQueue).toHaveLength(0);
  });
});

describe("getHeroes", () => {
  const hero = (id: number, updated_at: string) => ({
    id,
    name: `h${id}`,
    img: `${id}.png`,
    updated_at,
  });

  it("todos com menos de 1 dia: vem do banco", async () => {
    reads.heroes = { data: [hero(1, NOW), hero(2, NOW)], error: null };

    const map = await getHeroes();
    expect(api.getHeroesFromApi).not.toHaveBeenCalled();
    expect(map[2]).toEqual({ id: 2, name: "h2", img: "2.png" }); // sem updated_at
  });

  it("um vencido: rebusca a lista inteira e grava depois", async () => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    reads.heroes = { data: [hero(1, NOW), hero(2, old)], error: null };
    api.getHeroesFromApi.mockResolvedValue([{ id: 1, name: "novo", img: "n.png" }]);

    const map = await getHeroes();
    expect(map[1].name).toBe("novo");

    await flushAfter();
    expect(writes[0].table).toBe("heroes");
  });

  it("OpenDota fora: usa a lista antiga em vez de quebrar", async () => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    reads.heroes = { data: [hero(1, old)], error: null };
    api.getHeroesFromApi.mockRejectedValue(new od.OpenDotaError("unavailable", "x"));

    const map = await getHeroes();
    expect(map[1].name).toBe("h1");
  });

  it("banco vazio e OpenDota fora: devolve {} (página mostra hero_id)", async () => {
    reads.heroes = { data: [], error: null };
    api.getHeroesFromApi.mockRejectedValue(new od.OpenDotaError("unavailable", "x"));

    await expect(getHeroes()).resolves.toEqual({});
  });
});
