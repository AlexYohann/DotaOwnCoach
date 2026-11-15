import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PeersSnapshot } from "@/lib/peers";

// A rota decide quando a OpenDota é chamada: só no estado "start", e depois
// da resposta (after). Banco e renovação são dublês.

const afterQueue: (() => unknown)[] = [];
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return { ...real, after: (cb: () => unknown) => afterQueue.push(cb) };
});
vi.mock("@/lib/peers-data", () => ({ getPeersSnapshot: vi.fn(), refreshPeers: vi.fn() }));

import * as data from "@/lib/peers-data";
import { GET } from "@/app/player/[id]/peers/route";

const snapshot = vi.mocked(data.getPeersSnapshot);
const refresh = vi.mocked(data.refreshPeers);

const call = (id: string) =>
  // O handler não lê a requisição; só os params.
  GET(undefined as never, { params: Promise.resolve({ id }) });

const snap = (state: PeersSnapshot["state"]): PeersSnapshot => ({ state, peers: null, fetchedAt: null });

beforeEach(() => {
  afterQueue.length = 0;
  snapshot.mockReset();
  refresh.mockReset();
});

describe("GET /player/[id]/peers", () => {
  it("start: responde refreshing e renova depois da resposta", async () => {
    snapshot.mockResolvedValue(snap("start"));
    const res = await call("86745912");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).state).toBe("refreshing");
    expect(refresh).not.toHaveBeenCalled(); // ainda não: só no after()
    expect(afterQueue).toHaveLength(1);
    await afterQueue[0]();
    expect(refresh).toHaveBeenCalledWith(86745912);
  });

  it.each(["ready", "refreshing", "failed", "unknown"] as const)("%s: não renova", async (state) => {
    snapshot.mockResolvedValue(snap(state));
    const res = await call("86745912");
    expect((await res.json()).state).toBe(state);
    expect(afterQueue).toHaveLength(0);
  });

  it("SteamID64 vira o account_id", async () => {
    snapshot.mockResolvedValue(snap("ready"));
    await call("76561198047011640");
    expect(snapshot).toHaveBeenCalledWith(86745912);
  });

  it("ID inválido: 400 sem tocar no banco", async () => {
    const res = await call("abc");
    expect(res.status).toBe(400);
    expect((await res.json()).state).toBe("unknown");
    expect(snapshot).not.toHaveBeenCalled();
  });
});
