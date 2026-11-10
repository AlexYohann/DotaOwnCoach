import { beforeEach, describe, expect, it } from "vitest";
import {
  prepareSteamSession,
  STEAM_EMAIL_DOMAIN,
  steamEmail,
} from "@/lib/steam-session";

const STEAM_ID = "76561198065514372"; // → account_id 105248644
const USER_ID = "11111111-2222-3333-4444-555555555555";

type Call = { fn: string; args: unknown[] };
let calls: Call[];
let createUserError: { code: string; message: string } | null;
let linkResult: { data: unknown; error: unknown };
let upsertError: { code: string; message: string } | null;

// Admin falso: registra as chamadas e devolve o que cada teste configurar.
function fakeAdmin() {
  return {
    auth: {
      admin: {
        createUser: async (...args: unknown[]) => {
          calls.push({ fn: "createUser", args });
          return createUserError
            ? { data: { user: null }, error: createUserError }
            : { data: { user: { id: USER_ID } }, error: null };
        },
        generateLink: async (...args: unknown[]) => {
          calls.push({ fn: "generateLink", args });
          return linkResult;
        },
      },
    },
    from: (table: string) => ({
      upsert: async (...args: unknown[]) => {
        calls.push({ fn: `upsert:${table}`, args });
        return { error: upsertError };
      },
    }),
  } as never;
}

beforeEach(() => {
  calls = [];
  createUserError = null;
  upsertError = null;
  linkResult = {
    data: { user: { id: USER_ID }, properties: { hashed_token: "hash-123" } },
    error: null,
  };
});

describe("steamEmail", () => {
  it("usa o domínio interno que ninguém recebe", () => {
    expect(STEAM_EMAIL_DOMAIN).toBe("steam.invalid");
    expect(steamEmail(STEAM_ID)).toBe(`${STEAM_ID}@steam.invalid`);
  });
});

describe("prepareSteamSession", () => {
  it("usuário novo: cria com app_metadata e sem senha, gera o link e grava profiles", async () => {
    const r = await prepareSteamSession(fakeAdmin(), STEAM_ID);

    expect(r).toEqual({ userId: USER_ID, accountId: 105248644, tokenHash: "hash-123" });
    expect(calls.map((c) => c.fn)).toEqual([
      "createUser",
      "generateLink",
      "upsert:profiles",
    ]);
    const created = calls[0].args[0] as Record<string, unknown>;
    expect(created).toEqual({
      email: steamEmail(STEAM_ID),
      email_confirm: true,
      app_metadata: { steam_id64: STEAM_ID, account_id: 105248644 },
    });
    expect(created).not.toHaveProperty("password");
    expect(created).not.toHaveProperty("user_metadata");
    expect(calls[1].args[0]).toEqual({ type: "magiclink", email: steamEmail(STEAM_ID) });
    const row = calls[2].args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ id: USER_ID, account_id: 105248644, steam_id64: STEAM_ID });
    expect(new Date(String(row.last_login)).toISOString()).toBe(row.last_login);
  });

  it("usuário já existe (email_exists): segue para o link e atualiza last_login", async () => {
    createUserError = { code: "email_exists", message: "already registered" };

    const r = await prepareSteamSession(fakeAdmin(), STEAM_ID);

    expect(r.userId).toBe(USER_ID);
    expect(calls.map((c) => c.fn)).toEqual([
      "createUser",
      "generateLink",
      "upsert:profiles",
    ]);
  });

  it("outro erro no createUser lança", async () => {
    createUserError = { code: "unexpected_failure", message: "db down" };
    await expect(prepareSteamSession(fakeAdmin(), STEAM_ID)).rejects.toThrow();
    expect(calls.map((c) => c.fn)).toEqual(["createUser"]);
  });

  it("generateLink sem hashed_token lança", async () => {
    linkResult = { data: { user: { id: USER_ID }, properties: {} }, error: null };
    await expect(prepareSteamSession(fakeAdmin(), STEAM_ID)).rejects.toThrow();
  });

  it("generateLink com erro lança", async () => {
    linkResult = { data: { user: null, properties: null }, error: { code: "x", message: "y" } };
    await expect(prepareSteamSession(fakeAdmin(), STEAM_ID)).rejects.toThrow();
  });

  it("erro ao gravar profiles lança", async () => {
    upsertError = { code: "42501", message: "rls" };
    await expect(prepareSteamSession(fakeAdmin(), STEAM_ID)).rejects.toThrow();
  });

  it("SteamID64 que não vira account_id lança", async () => {
    await expect(
      prepareSteamSession(fakeAdmin(), "76561197960265728"),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
