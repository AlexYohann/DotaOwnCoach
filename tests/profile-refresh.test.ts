import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Dublês: Supabase (admin) e OpenDota.

type Call = { table: string; op: "update"; payload: Record<string, unknown>; filters: string[] };
let calls: Call[];
let adminEnabled: boolean;
let claimRows: unknown[]; // o que a "reserva" devolve: [] = já renovou hoje
let claimError: unknown;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    adminEnabled
      ? {
          from: (table: string) => ({
            update: (payload: Record<string, unknown>) => {
              const call: Call = { table, op: "update", payload, filters: [] };
              calls.push(call);
              const b: Record<string, unknown> = {};
              b.eq = (col: string, v: unknown) => (call.filters.push(`eq:${col}=${v}`), b);
              b.or = (expr: string) => (call.filters.push(`or:${expr}`), b);
              b.select = () => Promise.resolve({ data: claimRows, error: claimError });
              // players: o update é aguardado direto (sem select).
              b.then = (resolve: (r: { error: null }) => unknown) => resolve({ error: null });
              return b;
            },
          }),
        }
      : null,
}));

vi.mock("@/lib/opendota", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/opendota")>();
  return {
    OpenDotaError: real.OpenDotaError,
    getPlayer: vi.fn(),
    requestPlayerRefresh: vi.fn(),
  };
});

import * as od from "@/lib/opendota";
import { refreshOwnProfile } from "@/lib/profile-refresh";

const api = vi.mocked(od);
const noWait = () => Promise.resolve();
const profile = {
  account_id: 7,
  personaname: "nome novo",
  avatarmedium: "novo.png",
  profileurl: "https://steam/x",
};

beforeEach(() => {
  calls = [];
  adminEnabled = true;
  claimRows = [{ id: "u1" }];
  claimError = null;
  api.requestPlayerRefresh.mockReset().mockResolvedValue(undefined);
  api.getPlayer.mockReset().mockResolvedValue(profile as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("refreshOwnProfile", () => {
  it("primeira vez no dia: pede a renovação, espera e grava nome e avatar novos", async () => {
    const waits: number[] = [];
    const out = await refreshOwnProfile(7, (ms) => (waits.push(ms), Promise.resolve()));

    expect(out).toBe("done");
    // 1º: reserva em profiles, só se nunca renovou ou renovou há mais de 1 dia.
    expect(calls[0].table).toBe("profiles");
    expect(calls[0].filters[0]).toBe("eq:account_id=7");
    expect(calls[0].filters[1]).toMatch(/^or:profile_refreshed_at\.is\.null,profile_refreshed_at\.lt\./);
    expect(api.requestPlayerRefresh).toHaveBeenCalledWith(7);
    expect(waits).toHaveLength(1); // a OpenDota leva alguns segundos
    // 2º: nome/avatar em players — sem mexer em fetched_at (cache das partidas).
    expect(calls[1]).toMatchObject({
      table: "players",
      payload: { personaname: "nome novo", avatar: "novo.png", profile_url: "https://steam/x" },
      filters: ["eq:account_id=7"],
    });
    expect(calls[1].payload).not.toHaveProperty("fetched_at");
  });

  it("já renovou hoje (reserva não passa): não chama a OpenDota", async () => {
    claimRows = [];
    await expect(refreshOwnProfile(7, noWait)).resolves.toBe("skipped");
    expect(api.requestPlayerRefresh).not.toHaveBeenCalled();
    expect(api.getPlayer).not.toHaveBeenCalled();
  });

  it("erro na reserva: não chama a OpenDota", async () => {
    claimRows = [];
    claimError = { code: "XX000", message: "falhou" };
    await expect(refreshOwnProfile(7, noWait)).resolves.toBe("skipped");
    expect(api.requestPlayerRefresh).not.toHaveBeenCalled();
  });

  it("sem secret key: não faz nada", async () => {
    adminEnabled = false;
    await expect(refreshOwnProfile(7, noWait)).resolves.toBe("skipped");
    expect(api.requestPlayerRefresh).not.toHaveBeenCalled();
  });

  it("OpenDota recusa o pedido (limite): não lança e não grava em players", async () => {
    api.requestPlayerRefresh.mockRejectedValue(new od.OpenDotaError("rate_limit", "429"));
    await expect(refreshOwnProfile(7, noWait)).resolves.toBe("failed");
    expect(calls.filter((c) => c.table === "players")).toHaveLength(0);
  });

  it("perfil não existe na OpenDota: não grava em players", async () => {
    api.getPlayer.mockResolvedValue(null);
    await expect(refreshOwnProfile(7, noWait)).resolves.toBe("failed");
    expect(calls.filter((c) => c.table === "players")).toHaveLength(0);
  });
});
