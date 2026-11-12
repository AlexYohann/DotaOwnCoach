import { describe, expect, it } from "vitest";
import { steamProfileUrl, toAccountId } from "@/lib/steam";

describe("toAccountId", () => {
  it("aceita Friend ID (32 bits)", () => {
    expect(toAccountId("105248644")).toBe(105248644);
  });

  it("converte SteamID64 para Friend ID", () => {
    // 76561197960265728 + 105248644
    expect(toAccountId("76561198065514372")).toBe(105248644);
  });

  it("ignora espaços em volta", () => {
    expect(toAccountId("  105248644 \n")).toBe(105248644);
  });

  it.each([
    ["vazio", ""],
    ["letras", "abc"],
    ["negativo", "-5"],
    ["decimal", "1.5"],
    ["zero", "0"],
    ["URL de perfil", "https://steamcommunity.com/profiles/76561198065514372"],
    ["acima de 32 bits e abaixo da base do SteamID64", "4294967296"],
  ])("rejeita %s", (_, input) => {
    expect(toAccountId(input)).toBeNull();
  });

  it("aceita o maior Friend ID possível (2^32 - 1)", () => {
    expect(toAccountId("4294967295")).toBe(4294967295);
  });

  it("rejeita SteamID64 que vira account_id 0", () => {
    expect(toAccountId("76561197960265728")).toBeNull();
  });
});

describe("steamProfileUrl", () => {
  it("monta o endereço do perfil com o SteamID64", () => {
    expect(steamProfileUrl(321580662)).toBe(
      "https://steamcommunity.com/profiles/76561198281846390",
    );
    expect(steamProfileUrl(105248644)).toBe(
      "https://steamcommunity.com/profiles/76561198065514372",
    );
  });
});
