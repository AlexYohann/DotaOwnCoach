import { describe, expect, it, vi } from "vitest";

// lib/account.ts importa os clientes do Supabase; aqui só a parte pura importa.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createReadClient: vi.fn() }));

import { toHeaderAccount } from "@/lib/account";

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
