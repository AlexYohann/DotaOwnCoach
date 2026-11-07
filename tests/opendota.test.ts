import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "use cache"/cacheLife só existem dentro do Next; aqui não fazem nada.
vi.mock("next/cache", () => ({ cacheLife: () => {} }));

import {
  getHeroesFromApi,
  getMatch,
  getPlayer,
  getRecentMatches,
  OpenDotaError,
} from "@/lib/opendota";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("erros da OpenDota", () => {
  it("404 vira null (jogador inexistente), sem lançar", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    await expect(getPlayer(1)).resolves.toBeNull();
  });

  it("429 lança OpenDotaError rate_limit", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    const err = await getPlayer(1).catch((e) => e);
    expect(err).toBeInstanceOf(OpenDotaError);
    expect(err.kind).toBe("rate_limit");
  });

  it("5xx lança OpenDotaError unavailable", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 502 }));
    const err = await getPlayer(1).catch((e) => e);
    expect(err).toBeInstanceOf(OpenDotaError);
    expect(err.kind).toBe("unavailable");
  });

  it("falha de rede/timeout lança OpenDotaError unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await getRecentMatches(1).catch((e) => e);
    expect(err).toBeInstanceOf(OpenDotaError);
    expect(err.kind).toBe("unavailable");
  });

  it("JSON inválido lança OpenDotaError unavailable", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    const err = await getPlayer(1).catch((e) => e);
    expect(err).toBeInstanceOf(OpenDotaError);
    expect(err.kind).toBe("unavailable");
  });
});

describe("getPlayer", () => {
  it("devolve o profile", async () => {
    const profile = { account_id: 7, personaname: "x", avatarmedium: null, profileurl: null };
    fetchMock.mockResolvedValue(json({ profile }));
    await expect(getPlayer(7)).resolves.toEqual(profile);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.opendota.com/api/players/7");
  });

  it("perfil privado (sem profile no JSON) vira null", async () => {
    fetchMock.mockResolvedValue(json({ rank_tier: null }));
    await expect(getPlayer(7)).resolves.toBeNull();
  });
});

describe("getRecentMatches", () => {
  it("corta em 20 partidas", async () => {
    fetchMock.mockResolvedValue(json(Array.from({ length: 25 }, (_, i) => ({ match_id: i }))));
    await expect(getRecentMatches(7)).resolves.toHaveLength(20);
  });

  it("resposta que não é lista vira []", async () => {
    fetchMock.mockResolvedValue(json({ error: "x" }));
    await expect(getRecentMatches(7)).resolves.toEqual([]);
  });
});

describe("getHeroesFromApi", () => {
  it("usa o nome localizado e monta a URL da CDN sem query string", async () => {
    fetchMock.mockResolvedValue(
      json({
        "1": {
          id: 1,
          localized_name: "Anti-Mage",
          img: "/apps/dota2/images/dota_react/heroes/antimage.png?t=123",
        },
      }),
    );
    await expect(getHeroesFromApi()).resolves.toEqual([
      {
        id: 1,
        name: "Anti-Mage",
        img: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/antimage.png",
      },
    ]);
  });
});

describe("getMatch", () => {
  it("copia só os campos usados e organiza os itens", async () => {
    fetchMock.mockResolvedValue(
      json({
        match_id: 99,
        start_time: 1000,
        duration: 2000,
        radiant_win: true,
        radiant_score: 30,
        dire_score: 10,
        players: [
          {
            account_id: 7,
            personaname: "x",
            player_slot: 0,
            hero_id: 1,
            level: 25,
            kills: 10,
            deaths: 2,
            assists: 5,
            last_hits: 300,
            denies: 10,
            gold_per_min: 700,
            xp_per_min: 800,
            item_0: 1,
            item_1: 0,
            item_5: 63,
            backpack_2: 4,
            item_neutral: 300,
            gold_t: [0, 100, 200], // campo pesado que não deve ser copiado
          },
          { player_slot: 128, hero_id: 2 }, // anônimo e com campos faltando
        ],
      }),
    );

    const m = await getMatch(99);
    expect(m).not.toBeNull();
    const [p1, p2] = m!.players;
    expect(p1.items).toEqual([1, 0, 0, 0, 0, 63]);
    expect(p1.backpack).toEqual([0, 0, 4]);
    expect(p1.neutral).toEqual([300, 0]);
    expect(p1).not.toHaveProperty("gold_t");
    expect(p1.net_worth).toBeNull();
    expect(p2.account_id).toBeNull();
    expect(p2.personaname).toBeNull();
    expect(p2.items).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("radiant_win ausente vira null", async () => {
    fetchMock.mockResolvedValue(json({ match_id: 1, players: [] }));
    await expect(getMatch(1)).resolves.toMatchObject({ radiant_win: null });
  });

  it("partida sem players (ainda não processada) vira null", async () => {
    fetchMock.mockResolvedValue(json({ match_id: 1 }));
    await expect(getMatch(1)).resolves.toBeNull();
  });
});
