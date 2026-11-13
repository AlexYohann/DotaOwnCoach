import { describe, expect, it } from "vitest";
import { accountIdFromClaims, routeFor } from "@/lib/auth-routing";

describe("accountIdFromClaims", () => {
  it("lê o account_id de app_metadata", () => {
    expect(accountIdFromClaims({ app_metadata: { account_id: 105248644 } })).toBe(
      105248644,
    );
  });

  it.each([
    ["null", null],
    ["objeto vazio", {}],
    ["app_metadata vazio", { app_metadata: {} }],
    ["account_id em texto", { app_metadata: { account_id: "105248644" } }],
    ["zero", { app_metadata: { account_id: 0 } }],
    ["decimal", { app_metadata: { account_id: 1.5 } }],
    ["acima de 32 bits", { app_metadata: { account_id: 4294967296 } }],
  ])("recusa %s", (_, claims) => {
    expect(accountIdFromClaims(claims)).toBeNull();
  });

  it("ignora user_metadata (o próprio usuário pode editar)", () => {
    expect(accountIdFromClaims({ user_metadata: { account_id: 1 } })).toBeNull();
  });
});

describe("routeFor", () => {
  it("logado com account_id em / vai para /player/<id>", () => {
    expect(routeFor("/", true, 105248644)).toBe("/player/105248644");
  });

  it("logado sem account_id em / não redireciona", () => {
    expect(routeFor("/", true, null)).toBeNull();
  });

  it("logado em /player/1 não redireciona", () => {
    expect(routeFor("/player/1", true, 105248644)).toBeNull();
  });

  it.each(["/", "/player/1", "/match/2", "/auth/steam", "/auth/steam/callback", "/auth/error", "/pros", "/pros/search", "/pros/example", "/pros/refresh"])(
    "deslogado em %s não redireciona",
    (path) => {
      expect(routeFor(path, false, null)).toBeNull();
    },
  );

  it.each(["/protected", "/qualquer", "/login", "/players-falso", "/prosx"])(
    "deslogado em %s redireciona para /",
    (path) => {
      expect(routeFor(path, false, null)).toBe("/");
    },
  );
});
