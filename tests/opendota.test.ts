import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "use cache"/cacheLife só existem dentro do Next; aqui não fazem nada.
vi.mock("next/cache", () => ({ cacheLife: () => {} }));

import {
  getHeroesFromApi,
  getMatch,
  getProPlayers,
  getTeamPlayers,
  getTeams,
  getPlayer,
  getRecentMatches,
  OpenDotaError,
  requestPlayerRefresh,
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

  // Lone Druid: os itens ficam no urso, e a OpenDota os manda em additional_units.
  it("copia os itens das unidades extras (urso do Lone Druid)", async () => {
    fetchMock.mockResolvedValue(
      json({
        match_id: 1,
        players: [
          {
            player_slot: 0,
            hero_id: 80,
            item_neutral: 1861,
            additional_units: [
              { unitname: "spirit_bear", item_0: 249, item_1: 108, item_5: 158, backpack_1: 7, item_neutral: 0 },
              null, // lixo
              { item_0: 5 }, // sem nome: ignorada
            ],
          },
          { player_slot: 1, hero_id: 2 }, // sem o campo
          { player_slot: 2, hero_id: 3, additional_units: "lixo" },
        ],
      }),
    );
    const [druid, other, weird] = (await getMatch(1))!.players;
    expect(druid.items).toEqual([0, 0, 0, 0, 0, 0]);
    expect(druid.units).toEqual([
      {
        name: "spirit_bear",
        items: [249, 108, 0, 0, 0, 158],
        backpack: [0, 7, 0],
        neutral: [0, 0],
      },
    ]);
    expect(other.units).toEqual([]);
    expect(weird.units).toEqual([]);
  });

  it("copia os cosméticos (nome, raridade, ícone) e só esses campos", async () => {
    fetchMock.mockResolvedValue(
      json({
        match_id: 1,
        players: [
          {
            player_slot: 0,
            hero_id: 4,
            cosmetics: [
              {
                name: "Maw of Eztzhok",
                item_rarity: "immortal",
                image_path: "icons/econ/items/x.png",
                item_description: "#DOTA_Item_Desc",
                prefab: "wearable",
              },
              { name: "Sem imagem" },
              { item_rarity: "rare" }, // sem nome: ignorado
            ],
          },
          { player_slot: 128, hero_id: 2 }, // sem cosmetics (partida não processada)
        ],
      }),
    );
    const m = await getMatch(1);
    expect(m!.players[0].cosmetics).toEqual([
      {
        name: "Maw of Eztzhok",
        rarity: "immortal",
        img: "https://cdn.cloudflare.steamstatic.com/apps/570/icons/econ/items/x.png",
      },
      { name: "Sem imagem", rarity: "common", img: null },
    ]);
    expect(m!.players[1].cosmetics).toEqual([]);
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

// ---------------------------------------------------------------------------
// v2.1: pro players e times

const rawPro = (over: Record<string, unknown> = {}) => ({
  account_id: 321580662,
  name: "Yatoro",
  personaname: "raddan",
  avatarmedium: "https://avatars.steamstatic.com/a_medium.jpg",
  team_id: 7119388,
  team_name: "Team Spirit",
  team_tag: "TSpirit",
  is_locked: true,
  last_match_time: "2026-11-01T10:00:00.000Z",
  ...over,
});

describe("getProPlayers", () => {
  it("mapeia os campos usados", async () => {
    fetchMock.mockResolvedValue(json([rawPro()]));
    await expect(getProPlayers()).resolves.toEqual([
      {
        account_id: 321580662,
        name: "Yatoro",
        personaname: "raddan",
        avatar: "https://avatars.steamstatic.com/a_medium.jpg",
        team_id: 7119388,
        team_name: "Team Spirit",
        team_tag: "TSpirit",
        verified: true,
        last_match_time: "2026-11-01T10:00:00.000Z",
      },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.opendota.com/api/proPlayers");
  });

  it("is_locked nulo não é verificado; time 0 e textos vazios viram null", async () => {
    fetchMock.mockResolvedValue(
      json([rawPro({ is_locked: null, team_id: 0, team_name: "", team_tag: "", last_match_time: null })]),
    );
    const [p] = await getProPlayers();
    expect(p.verified).toBe(false);
    expect(p.team_id).toBeNull();
    expect(p.team_name).toBeNull();
    expect(p.team_tag).toBeNull();
    expect(p.last_match_time).toBeNull();
  });

  it("pula registros sem account_id válido ou sem nick", async () => {
    fetchMock.mockResolvedValue(
      json([
        rawPro({ account_id: null }),
        rawPro({ account_id: -5 }),
        rawPro({ account_id: 1.5 }),
        rawPro({ account_id: 10, name: null }),
        rawPro({ account_id: 11, name: "   " }),
        null,
        rawPro({ account_id: 12, name: "ok" }),
      ]),
    );
    const out = await getProPlayers();
    expect(out.map((p) => p.account_id)).toEqual([12]);
  });

  // Revisão final: um registro estranho não pode fazer o banco recusar o lote inteiro.
  it("data que não é data vira null; ID repetido entra uma vez só", async () => {
    fetchMock.mockResolvedValue(
      json([
        rawPro({ account_id: 20, name: "a", last_match_time: "lixo" }),
        rawPro({ account_id: 21, name: "b", last_match_time: "2026-11-01T12:00:00.000Z" }),
        rawPro({ account_id: 21, name: "b de novo" }),
      ]),
    );
    const out = await getProPlayers();
    expect(out.map((p) => [p.account_id, p.name, p.last_match_time])).toEqual([
      [20, "a", null],
      [21, "b", "2026-11-01T12:00:00.000Z"],
    ]);
  });

  it("corpo que não é lista lança OpenDotaError unavailable", async () => {
    fetchMock.mockResolvedValue(json({}));
    const err = await getProPlayers().catch((e) => e);
    expect(err).toBeInstanceOf(OpenDotaError);
    expect(err.kind).toBe("unavailable");
  });

  it("429 lança rate_limit", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    const err = await getProPlayers().catch((e) => e);
    expect(err.kind).toBe("rate_limit");
  });
});

describe("getTeams", () => {
  it("mapeia os campos e pula itens sem id ou rating", async () => {
    fetchMock.mockResolvedValue(
      json([
        { team_id: 7119388, name: "Team Spirit", tag: "TSpirit", logo_url: "https://x/l.png", rating: 1592.4, last_match_time: 1793500000 },
        { team_id: 2, name: "Sem logo", tag: "", rating: 1400, last_match_time: null },
        { name: "sem id", rating: 1 },
        { team_id: 3, name: "sem rating", rating: null },
      ]),
    );
    await expect(getTeams()).resolves.toEqual([
      { team_id: 7119388, name: "Team Spirit", tag: "TSpirit", logo_url: "https://x/l.png", rating: 1592.4, last_match_time: 1793500000 },
      { team_id: 2, name: "Sem logo", tag: null, logo_url: null, rating: 1400, last_match_time: null },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.opendota.com/api/teams");
  });

  it("horário absurdo vira null; time repetido entra uma vez só", async () => {
    fetchMock.mockResolvedValue(
      json([
        { team_id: 5, name: "A", rating: 1500, last_match_time: 1e300 },
        { team_id: 6, name: "B", rating: 1400, last_match_time: -1 },
        { team_id: 6, name: "B de novo", rating: 1300, last_match_time: 1793500000 },
      ]),
    );
    const out = await getTeams();
    expect(out.map((t) => [t.team_id, t.name, t.last_match_time])).toEqual([
      [5, "A", null],
      [6, "B", null],
    ]);
  });

  it("corpo que não é lista lança unavailable", async () => {
    fetchMock.mockResolvedValue(json(null));
    const err = await getTeams().catch((e) => e);
    expect(err).toBeInstanceOf(OpenDotaError);
    expect(err.kind).toBe("unavailable");
  });
});

describe("requestPlayerRefresh", () => {
  it("faz POST no endereço de renovação da conta", async () => {
    fetchMock.mockResolvedValue(json({}));
    await expect(requestPlayerRefresh(217152877)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.opendota.com/api/players/217152877/refresh");
    expect(init.method).toBe("POST");
  });

  it("429 lança rate_limit; 500 lança unavailable", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    expect((await requestPlayerRefresh(1).catch((e) => e)).kind).toBe("rate_limit");
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    expect((await requestPlayerRefresh(1).catch((e) => e)).kind).toBe("unavailable");
  });
});

describe("getTeamPlayers", () => {
  it("chama o endereço do time e devolve os membros", async () => {
    const members = [
      { account_id: 321580662, name: "Yatoro", games_played: 1354, wins: 900, is_current_team_member: true },
      { account_id: 5, name: null, games_played: 2, wins: 1, is_current_team_member: null },
    ];
    fetchMock.mockResolvedValue(json(members));
    await expect(getTeamPlayers(7119388)).resolves.toEqual([
      { account_id: 321580662, name: "Yatoro", games_played: 1354, is_current_team_member: true },
      { account_id: 5, name: null, games_played: 2, is_current_team_member: null },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.opendota.com/api/teams/7119388/players");
  });

  it("404 vira lista vazia", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    await expect(getTeamPlayers(1)).resolves.toEqual([]);
  });

  it("429 lança rate_limit", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    const err = await getTeamPlayers(1).catch((e) => e);
    expect(err.kind).toBe("rate_limit");
  });
});
