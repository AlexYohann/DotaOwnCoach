import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Peer, PeersRow } from "@/lib/peers";

// ---------------------------------------------------------------------------
// Dublês: players + player_peers em memória, a reserva (rpc) e a OpenDota.

const NOW = Date.parse("2026-11-15T12:00:00Z");
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

let playerExists: boolean;
let peersRow: PeersRow | null;
let readError: boolean;
let adminEnabled: boolean;
let claimResult: { data: unknown; error: unknown };
let rpcCalls: { fn: string; args: Record<string, unknown> }[];
let updates: Record<string, unknown>[];

function readBuilder() {
  const b = {
    select: () => b,
    eq: () => b,
    maybeSingle: () =>
      Promise.resolve(
        readError
          ? { data: null, error: { code: "XX", message: "falhou" } }
          : { data: playerExists ? { account_id: 1, player_peers: peersRow } : null, error: null },
      ),
  };
  return b;
}

function adminBuilder() {
  let payload: Record<string, unknown> | null = null;
  const run = () => {
    if (payload) {
      updates.push(payload);
      if (peersRow) Object.assign(peersRow, payload);
      return { data: null, error: null };
    }
    return { data: peersRow ? { peers: peersRow.peers } : null, error: null };
  };
  const b = {
    select: () => b,
    update: (p: Record<string, unknown>) => ((payload = p), b),
    eq: () => b,
    maybeSingle: () => Promise.resolve(run()),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createReadClient: () => ({ from: () => readBuilder() }),
  createAdminClient: () =>
    adminEnabled
      ? {
          from: () => adminBuilder(),
          rpc: (fn: string, args: Record<string, unknown>) => {
            rpcCalls.push({ fn, args });
            return Promise.resolve(claimResult);
          },
        }
      : null,
}));

vi.mock("@/lib/opendota", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/opendota")>();
  return { OpenDotaError: real.OpenDotaError, getPeers: vi.fn() };
});

import * as od from "@/lib/opendota";
import { getPeersSnapshot, refreshPeers } from "@/lib/peers-data";

const getPeers = vi.mocked(od.getPeers);

const peer = (id: number, withGames: number): Peer => ({
  account_id: id,
  name: `p${id}`,
  avatar: null,
  with_games: withGames,
  with_win: 1,
  against_games: 0,
  against_win: 0,
  last_played: Math.floor(NOW / 1000),
});

const emptyRow = (): PeersRow => ({
  peers: null,
  fetched_at: null,
  refresh_started_at: null,
  refresh_failed_at: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  playerExists = true;
  peersRow = emptyRow();
  readError = false;
  adminEnabled = true;
  claimResult = { data: true, error: null };
  rpcCalls = [];
  updates = [];
  getPeers.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getPeersSnapshot", () => {
  it("conta fora de players: unknown", async () => {
    playerExists = false;
    await expect(getPeersSnapshot(1)).resolves.toEqual({ state: "unknown", peers: null, fetchedAt: null });
  });

  it("lista fresca: ready com a lista e a data", async () => {
    peersRow = { ...emptyRow(), peers: [peer(2, 5)], fetched_at: iso(NOW - HOUR) };
    await expect(getPeersSnapshot(1)).resolves.toEqual({
      state: "ready",
      peers: [peer(2, 5)],
      fetchedAt: iso(NOW - HOUR),
    });
  });

  it("jogador sem linha de parceiros: start", async () => {
    peersRow = null;
    expect((await getPeersSnapshot(1)).state).toBe("start");
  });

  it("lista vencida continua sendo entregue (com o estado)", async () => {
    peersRow = { ...emptyRow(), peers: [peer(2, 5)], fetched_at: iso(NOW - 13 * HOUR) };
    const snap = await getPeersSnapshot(1);
    expect(snap.state).toBe("start");
    expect(snap.peers).toEqual([peer(2, 5)]);
  });

  it("erro do banco não derruba: start sem lista", async () => {
    readError = true;
    await expect(getPeersSnapshot(1)).resolves.toEqual({ state: "start", peers: null, fetchedAt: null });
  });
});

describe("refreshPeers", () => {
  it("reserva com os prazos da regra e grava só quem tem 3+ juntos", async () => {
    getPeers.mockResolvedValue([peer(2, 2), peer(3, 7)]);
    await expect(refreshPeers(1)).resolves.toBe("saved");
    expect(rpcCalls).toEqual([
      {
        fn: "claim_peers_refresh",
        args: { p_account_id: 1, p_ttl_s: 43200, p_running_s: 120, p_retry_s: 600 },
      },
    ]);
    expect(updates).toEqual([
      { peers: [peer(3, 7)], fetched_at: iso(NOW), refresh_started_at: null, refresh_failed_at: null },
    ]);
  });

  it("reserva negada (outra aba já pediu): não chama a OpenDota", async () => {
    claimResult = { data: false, error: null };
    await expect(refreshPeers(1)).resolves.toBe("busy");
    expect(getPeers).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("sem secret key: não chama a OpenDota", async () => {
    adminEnabled = false;
    await expect(refreshPeers(1)).resolves.toBe("failed");
    expect(getPeers).not.toHaveBeenCalled();
  });

  it("erro na reserva: não chama a OpenDota", async () => {
    claimResult = { data: null, error: { code: "23503", message: "fk" } };
    await expect(refreshPeers(1)).resolves.toBe("failed");
    expect(getPeers).not.toHaveBeenCalled();
  });

  it("OpenDota falhou: marca a falha e libera a reserva", async () => {
    getPeers.mockRejectedValue(new od.OpenDotaError("unavailable", "HTTP 500"));
    await expect(refreshPeers(1)).resolves.toBe("failed");
    expect(updates).toEqual([{ refresh_failed_at: iso(NOW), refresh_started_at: null }]);
  });

  it("lista vazia não apaga uma lista boa", async () => {
    peersRow = { ...emptyRow(), peers: [peer(2, 5)], fetched_at: iso(NOW - 13 * HOUR) };
    getPeers.mockResolvedValue([]);
    await expect(refreshPeers(1)).resolves.toBe("failed");
    expect(peersRow.peers).toEqual([peer(2, 5)]);
    expect(updates).toEqual([{ refresh_failed_at: iso(NOW), refresh_started_at: null }]);
  });

  it("lista vazia sem nada salvo é resposta válida", async () => {
    getPeers.mockResolvedValue([peer(2, 1)]);
    await expect(refreshPeers(1)).resolves.toBe("saved");
    expect(updates[0]).toMatchObject({ peers: [], fetched_at: iso(NOW) });
  });
});
