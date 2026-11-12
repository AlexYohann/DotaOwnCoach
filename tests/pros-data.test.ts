import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Dublês: after() do Next, Supabase e OpenDota (mesmo padrão de data.test.ts).

const afterQueue: (() => unknown)[] = [];
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => afterQueue.push(cb),
}));
async function flushAfter() {
  while (afterQueue.length) await afterQueue.shift()!();
}

type Call = {
  client: "read" | "admin";
  table: string;
  op: "select" | "update" | "upsert" | "delete" | "rpc";
  payload?: unknown;
  single: boolean;
};
type DbResult = { data?: unknown; error: unknown };

let calls: Call[];
let respond: (c: Call) => DbResult;
let adminEnabled: boolean;

// Query builder encadeável e "aguardável", como o do Supabase. Registra a
// chamada quando ela é de fato executada (await).
function builder(client: Call["client"], table: string) {
  const call: Call = { client, table, op: "select", single: false };
  let opSet = false;
  const run = () => {
    calls.push(call);
    return Promise.resolve(respond(call));
  };
  const b: Record<string, unknown> = {};
  for (const m of ["eq", "lt", "not", "order", "in", "limit"]) b[m] = () => b;
  b.select = () => b; // depois de update/upsert não muda a operação
  for (const op of ["update", "upsert", "delete"] as const) {
    b[op] = (payload?: unknown) => {
      if (!opSet) {
        call.op = op;
        call.payload = payload;
        opSet = true;
      }
      return b;
    };
  }
  b.maybeSingle = () => {
    call.single = true;
    return run();
  };
  b.then = (ok: (r: DbResult) => unknown, fail?: (e: unknown) => unknown) =>
    run().then(ok, fail);
  return b;
}

const client = (name: Call["client"]) => ({
  from: (table: string) => builder(name, table),
  rpc: (fn: string, args: unknown) => {
    const call: Call = { client: name, table: fn, op: "rpc", payload: args, single: false };
    calls.push(call);
    return Promise.resolve(respond(call));
  },
});

vi.mock("@/lib/supabase/admin", () => ({
  createReadClient: () => client("read"),
  createAdminClient: () => (adminEnabled ? client("admin") : null),
}));

vi.mock("@/lib/opendota", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/opendota")>();
  return {
    OpenDotaError: real.OpenDotaError,
    getProPlayers: vi.fn(),
    getTeams: vi.fn(),
    getTeamPlayers: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ cacheLife: () => {} }));

import * as od from "@/lib/opendota";
import {
  getExampleAccountId,
  getFeaturedTeams,
  getVerifiedPro,
  refreshPros,
  searchPros,
} from "@/lib/pros-data";

const api = vi.mocked(od);

// ---------------------------------------------------------------------------
// Dados de exemplo

const NOW_S = Math.floor(Date.now() / 1000);
const TWO_DAYS_AGO = new Date(Date.now() - 2 * 86_400_000).toISOString();
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

const players = (n: number): od.ProPlayer[] =>
  Array.from({ length: n }, (_, i) => ({
    account_id: 1000 + i,
    name: `Pro${i}`,
    personaname: null,
    avatar: `https://avatars.steamstatic.com/${i}_medium.jpg`,
    team_id: null,
    team_name: null,
    team_tag: null,
    verified: i % 2 === 0,
    last_match_time: iso(1),
  }));

const teams = (n: number): od.ProTeam[] =>
  Array.from({ length: n }, (_, i) => ({
    team_id: 500 + i,
    name: `Time ${i}`,
    tag: `T${i}`,
    logo_url: i === 0 ? "http://inseguro/logo.png" : `https://cdn/logo${i}.png`,
    rating: 2000 - i,
    last_match_time: NOW_S - 3600,
  }));

// Elenco de cada time: dois jogadores atuais (ids 1000+2k e 1001+2k) e um ex.
const membersOf = (teamId: number): od.TeamMember[] => {
  const k = teamId - 500;
  return [
    { account_id: 1000 + 2 * k, name: `Pro${2 * k}`, games_played: 100, is_current_team_member: true },
    { account_id: 1001 + 2 * k, name: `Pro${2 * k + 1}`, games_played: 50, is_current_team_member: true },
    { account_id: 9999, name: "ex", games_played: 900, is_current_team_member: false },
  ];
};

// Estado do banco falso.
let db: {
  claim: boolean;
  completedAt: string | null;
  featured: unknown[];
  proRows: unknown[];
  proRow: unknown;
  rpcRows: unknown[];
  failUpsert: string | null;
  failRead: boolean;
  failRpc: boolean;
};

const savedTeam = (i: number) => ({
  team_id: 500 + i,
  name: `Time ${i}`,
  tag: `T${i}`,
  logo_url: `https://cdn/logo${i}.png`,
  rating: 2000 - i,
  roster: [
    { account_id: 1000 + 2 * i, name: `Pro${2 * i}` },
    { account_id: 1001 + 2 * i, name: `Pro${2 * i + 1}` },
  ],
});
const savedPro = (id: number, verified: boolean, daysAgo: number | null) => ({
  account_id: id,
  avatar: `https://avatars.steamstatic.com/${id}.jpg`,
  verified,
  last_match_time: daysAgo === null ? null : iso(daysAgo),
});

beforeEach(() => {
  calls = [];
  adminEnabled = true;
  db = {
    claim: true,
    completedAt: new Date().toISOString(),
    featured: [],
    proRows: [],
    proRow: null,
    rpcRows: [],
    failUpsert: null,
    failRead: false,
    failRpc: false,
  };
  respond = (c) => {
    const boom = { code: "XX000", message: "falhou" };
    if (c.op === "rpc") return db.failRpc ? { data: null, error: boom } : { data: db.rpcRows, error: null };
    if (c.table === "pros_refresh") {
      if (c.op === "select") return { data: { completed_at: db.completedAt }, error: null };
      const p = c.payload as Record<string, unknown>;
      if ("attempted_at" in p) return { data: db.claim ? [{ id: true }] : [], error: null };
      return { error: null };
    }
    if (c.op === "upsert") return { error: c.table === db.failUpsert ? boom : null };
    if (c.op === "delete") return { error: null };
    if (db.failRead) return { data: null, error: boom };
    if (c.table === "pro_teams") return { data: db.featured, error: null };
    if (c.single) return { data: db.proRow, error: null };
    return { data: db.proRows, error: null };
  };
  api.getProPlayers.mockResolvedValue(players(1200));
  api.getTeams.mockResolvedValue(teams(150));
  api.getTeamPlayers.mockImplementation(async (id: number) => membersOf(id));
  // A pausa entre as chamadas de elenco usa setTimeout; Date continua real.
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  afterQueue.length = 0;
});

/** Roda a promessa avançando as pausas falsas; devolve o valor ou o erro. */
async function settle<T>(p: Promise<T>): Promise<T | Error> {
  const done = p.then(
    (v) => v,
    (e: Error) => e,
  );
  await vi.runAllTimersAsync();
  return done;
}

const writes = () => calls.filter((c) => c.op === "upsert" || c.op === "delete");
const completed = () =>
  calls.filter(
    (c) => c.table === "pros_refresh" && c.op === "update" && "completed_at" in (c.payload as object),
  );

// ---------------------------------------------------------------------------

describe("refreshPros", () => {
  it("sem secret key não faz nada", async () => {
    adminEnabled = false;
    await expect(settle(refreshPros())).resolves.toEqual({ status: "skipped", reason: "no-admin" });
    expect(api.getProPlayers).not.toHaveBeenCalled();
  });

  it("reserva negada (outra renovação há menos de 10 min) não chama a OpenDota", async () => {
    db.claim = false;
    await expect(settle(refreshPros())).resolves.toEqual({ status: "skipped", reason: "claimed" });
    expect(api.getProPlayers).not.toHaveBeenCalled();
    expect(api.getTeams).not.toHaveBeenCalled();
  });

  it("caminho feliz: grava tudo, apaga o que saiu e marca como concluído por último", async () => {
    const out = await settle(refreshPros());
    expect(out).toEqual({ status: "done", players: 1200, teams: 150 });
    expect(api.getTeamPlayers).toHaveBeenCalledTimes(6);

    const teamRows = calls
      .filter((c) => c.table === "pro_teams" && c.op === "upsert")
      .flatMap((c) => c.payload as { team_id: number; roster: unknown; logo_url: string | null }[]);
    expect(teamRows).toHaveLength(150);
    const featured = teamRows.filter((t) => t.roster !== null);
    expect(featured.map((t) => t.team_id)).toEqual([500, 501, 502, 503, 504, 505]);
    expect(featured[1].roster).toEqual([
      { account_id: 1002, name: "Pro2" },
      { account_id: 1003, name: "Pro3" },
    ]);
    expect(teamRows[0].logo_url).toBeNull(); // http:// não é gravado
    expect(teamRows[1].logo_url).toBe("https://cdn/logo1.png");

    const playerRows = calls
      .filter((c) => c.table === "pro_players" && c.op === "upsert")
      .flatMap((c) => c.payload as { name_norm: string }[]);
    expect(playerRows).toHaveLength(1200);
    expect(playerRows[7].name_norm).toBe("pro7");

    // Ordem: todas as gravações, depois as remoções, depois "concluído".
    const order = calls.filter((c) => c.client === "admin").map((c) => `${c.op}:${c.table}`);
    const lastUpsert = order.map((o) => o.startsWith("upsert")).lastIndexOf(true);
    const firstDelete = order.findIndex((o) => o.startsWith("delete"));
    expect(firstDelete).toBeGreaterThan(lastUpsert);
    expect(calls.filter((c) => c.op === "delete").map((c) => c.table).sort()).toEqual([
      "pro_players",
      "pro_teams",
    ]);
    expect(order[order.length - 1]).toBe("update:pros_refresh");
    expect(completed()).toHaveLength(1);
  });

  it("lista de pros minúscula (falha parcial da OpenDota): recusa gravar e apagar", async () => {
    api.getProPlayers.mockResolvedValue(players(3));
    const out = await settle(refreshPros());
    expect(out).toBeInstanceOf(od.OpenDotaError);
    expect(writes()).toHaveLength(0);
    expect(completed()).toHaveLength(0);
  });

  it("lista de times minúscula: recusa gravar e apagar", async () => {
    api.getTeams.mockResolvedValue(teams(5));
    const out = await settle(refreshPros());
    expect(out).toBeInstanceOf(od.OpenDotaError);
    expect(writes()).toHaveLength(0);
    expect(completed()).toHaveLength(0);
  });

  it("uma chamada de elenco falha no meio: nada é gravado nem apagado", async () => {
    let n = 0;
    api.getTeamPlayers.mockImplementation(async (id: number) => {
      if (++n === 4) throw new od.OpenDotaError("rate_limit", "429");
      return membersOf(id);
    });
    const out = await settle(refreshPros());
    expect(out).toBeInstanceOf(od.OpenDotaError);
    expect(writes()).toHaveLength(0);
    expect(completed()).toHaveLength(0);
  });

  it("erro ao gravar pro_players: não apaga nada e não marca como concluído", async () => {
    db.failUpsert = "pro_players";
    const out = await settle(refreshPros());
    expect(out).toBeInstanceOf(Error);
    expect(calls.filter((c) => c.op === "delete")).toHaveLength(0);
    expect(completed()).toHaveLength(0);
  });
});

describe("getFeaturedTeams", () => {
  beforeEach(() => {
    db.featured = [savedTeam(0), savedTeam(1)];
    db.proRows = [{ ...savedPro(1000, true, 2), last_match_time: TWO_DAYS_AGO }, savedPro(1002, false, 2)];
  });

  it("em dia: só banco, sem OpenDota e sem renovação agendada", async () => {
    const out = (await settle(getFeaturedTeams())) as Awaited<ReturnType<typeof getFeaturedTeams>>;
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ teamId: 500, name: "Time 0", tag: "T0", rating: 2000 });
    expect(out[0].roster).toEqual([
      { accountId: 1000, name: "Pro0", avatar: "https://avatars.steamstatic.com/1000.jpg", verified: true, lastMatchTime: TWO_DAYS_AGO },
      // 1001 não está em pro_players: aparece sem avatar e sem selo
      { accountId: 1001, name: "Pro1", avatar: null, verified: false, lastMatchTime: null },
    ]);
    expect(afterQueue).toHaveLength(0);
    expect(api.getTeams).not.toHaveBeenCalled();
  });

  it("vencido: responde com o banco e renova depois da resposta", async () => {
    db.completedAt = iso(2);
    const out = (await settle(getFeaturedTeams())) as unknown[];
    expect(out).toHaveLength(2);
    expect(api.getTeams).not.toHaveBeenCalled();
    expect(afterQueue).toHaveLength(1);
    await settle(flushAfter());
    expect(api.getTeams).toHaveBeenCalledTimes(1);
    expect(completed()).toHaveLength(1);
  });

  it("nunca concluído (completed_at nulo) também renova depois", async () => {
    db.completedAt = null;
    await settle(getFeaturedTeams());
    expect(afterQueue).toHaveLength(1);
  });

  it("vencido sem secret key: responde com o banco e não agenda nada", async () => {
    adminEnabled = false;
    db.completedAt = iso(2);
    const out = (await settle(getFeaturedTeams())) as unknown[];
    expect(out).toHaveLength(2);
    expect(afterQueue).toHaveLength(0);
  });

  it("vazio com reserva feita: busca na OpenDota na hora e grava só depois", async () => {
    db.featured = [];
    const out = (await settle(getFeaturedTeams())) as Awaited<ReturnType<typeof getFeaturedTeams>>;
    expect(out.map((t) => t.teamId)).toEqual([500, 501, 502, 503, 504, 505]);
    expect(out[0].logoUrl).toBeNull(); // http://
    expect(out[1].roster[0]).toMatchObject({ accountId: 1002, name: "Pro2", verified: true });
    expect(writes()).toHaveLength(0); // ainda não gravou
    await settle(flushAfter());
    expect(writes().length).toBeGreaterThan(0);
    expect(completed()).toHaveLength(1);
  });

  it("vazio com reserva negada: lança OpenDotaError unavailable", async () => {
    db.featured = [];
    db.claim = false;
    const out = await settle(getFeaturedTeams());
    expect(out).toBeInstanceOf(od.OpenDotaError);
    expect((out as od.OpenDotaError).kind).toBe("unavailable");
    expect(api.getTeams).not.toHaveBeenCalled();
  });

  it("vazio sem secret key: busca na hora e não grava", async () => {
    db.featured = [];
    adminEnabled = false;
    const out = (await settle(getFeaturedTeams())) as unknown[];
    expect(out).toHaveLength(6);
    await settle(flushAfter());
    expect(writes()).toHaveLength(0);
  });
});

describe("searchPros", () => {
  const row = (over: Record<string, unknown>) => ({
    account_id: 321580662,
    name: "Yatoro",
    avatar: "https://avatars.steamstatic.com/y.jpg",
    team_name: "Team Spirit",
    team_tag: "TSpirit",
    logo_url: "https://cdn/spirit.png",
    last_match_time: "2026-11-01T10:00:00+00:00",
    verified: true,
    ...over,
  });

  it("separa verificados dos outros e passa q para a função do banco", async () => {
    db.rpcRows = [row({}), row({ account_id: 2, verified: false, logo_url: "http://x/l.png", team_name: null })];
    const out = await searchPros("yat");
    expect(calls[0]).toMatchObject({ client: "read", op: "rpc", table: "search_pros", payload: { q: "yat" } });
    expect(out.verified).toEqual([
      {
        accountId: 321580662,
        name: "Yatoro",
        avatar: "https://avatars.steamstatic.com/y.jpg",
        teamName: "Team Spirit",
        teamTag: "TSpirit",
        teamLogo: "https://cdn/spirit.png",
        lastMatchTime: "2026-11-01T10:00:00+00:00",
        verified: true,
      },
    ]);
    expect(out.others).toHaveLength(1);
    expect(out.others[0].teamLogo).toBeNull(); // http:// vira sigla na tela
    expect(out.others[0].teamName).toBeNull();
  });

  it("erro do banco vira resultado vazio, sem lançar", async () => {
    db.failRpc = true;
    await expect(searchPros("yat")).resolves.toEqual({ verified: [], others: [] });
  });
});

describe("getExampleAccountId", () => {
  beforeEach(() => {
    db.featured = [savedTeam(0), savedTeam(1)];
    db.proRows = [
      savedPro(1000, true, 2), // candidato
      savedPro(1001, false, 2), // não verificado
      savedPro(1002, true, 45), // parado há mais de 30 dias
      savedPro(1003, true, 29), // candidato
    ];
  });

  it("sorteia entre verificados do elenco com partida nos últimos 30 dias", async () => {
    await expect(settle(getExampleAccountId(() => 0))).resolves.toBe(1000);
    await expect(settle(getExampleAccountId(() => 0.99))).resolves.toBe(1003);
  });

  it("sem candidato devolve null", async () => {
    db.proRows = [savedPro(1001, false, 2), savedPro(1002, true, null)];
    await expect(settle(getExampleAccountId(() => 0))).resolves.toBeNull();
  });

  it("erro (banco vazio e OpenDota fora) devolve null", async () => {
    db.featured = [];
    api.getTeams.mockRejectedValue(new od.OpenDotaError("unavailable", "fora"));
    await expect(settle(getExampleAccountId(() => 0))).resolves.toBeNull();
  });
});

describe("getVerifiedPro", () => {
  it("pro verificado: nick e time", async () => {
    db.proRow = { name: "Yatoro", team_name: "Team Spirit", verified: true };
    await expect(getVerifiedPro(321580662)).resolves.toEqual({ name: "Yatoro", teamName: "Team Spirit" });
  });

  it("homônimo não verificado não ganha a linha", async () => {
    db.proRow = { name: "Yatoro", team_name: "DGTeam", verified: false };
    await expect(getVerifiedPro(1)).resolves.toBeNull();
  });

  it("fora da lista ou erro do banco: null, sem lançar", async () => {
    await expect(getVerifiedPro(1)).resolves.toBeNull();
    db.failRead = true;
    await expect(getVerifiedPro(1)).resolves.toBeNull();
  });
});
