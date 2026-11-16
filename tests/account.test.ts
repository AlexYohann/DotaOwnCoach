import { describe, expect, it, vi } from "vitest";

// lib/account.ts importa os clientes do Supabase; aqui só a parte pura importa.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createReadClient: vi.fn() }));

import { getViewerSession, toHeaderAccount } from "@/lib/account";
import * as server from "@/lib/supabase/server";

describe("toHeaderAccount", () => {
  it("com linha em players usa nome e avatar", () => {
    expect(
      toHeaderAccount(217152877, { personaname: "Areq", avatar: "https://a/b.jpg" }),
    ).toEqual({ accountId: 217152877, name: "Areq", avatar: "https://a/b.jpg" });
  });

  it('sem linha em players: "Conta <id>" e avatar null', () => {
    expect(toHeaderAccount(217152877, null)).toEqual({
      accountId: 217152877,
      name: "Conta 217152877",
      avatar: null,
    });
  });

  it('personaname null usa "Conta <id>" e mantém o avatar', () => {
    expect(toHeaderAccount(5, { personaname: null, avatar: "x.png" })).toEqual({
      accountId: 5,
      name: "Conta 5",
      avatar: "x.png",
    });
  });
});

describe("getViewerSession", () => {
  const withClaims = (claims: unknown) =>
    vi.mocked(server.createClient).mockResolvedValue({
      auth: { getClaims: async () => ({ data: claims === undefined ? null : { claims } }) },
    } as never);

  it("userId do sub e account_id do app_metadata", async () => {
    withClaims({ sub: "uuid-a", app_metadata: { account_id: 217152877 } });
    await expect(getViewerSession()).resolves.toEqual({ userId: "uuid-a", accountId: 217152877 });
  });

  it("sem sub, sem account_id, sem sessão ou erro: null", async () => {
    withClaims({ app_metadata: { account_id: 217152877 } });
    await expect(getViewerSession()).resolves.toBeNull();
    withClaims({ sub: "uuid-a", user_metadata: { account_id: 217152877 } }); // user_metadata é editável: ignorado
    await expect(getViewerSession()).resolves.toBeNull();
    withClaims(undefined);
    await expect(getViewerSession()).resolves.toBeNull();
    vi.mocked(server.createClient).mockRejectedValue(new Error("cookies"));
    await expect(getViewerSession()).resolves.toBeNull();
  });
});
