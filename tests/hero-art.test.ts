import { describe, expect, it } from "vitest";
import {
  HOME_HEROES,
  heroImageUrl,
  heroKey,
  heroRenderUrl,
  ILLUSTRATION_URL,
  rarityColor,
} from "@/lib/hero-art";

describe("heroKey", () => {
  it("extrai o nome interno da URL da imagem do herói", () => {
    expect(
      heroKey(
        "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/night_stalker.png",
      ),
    ).toBe("night_stalker");
  });

  it("ignora query string", () => {
    expect(heroKey("/apps/dota2/images/dota_react/heroes/antimage.png?t=123")).toBe(
      "antimage",
    );
  });

  it("herói desconhecido (sem imagem) vira null", () => {
    expect(heroKey(undefined)).toBeNull();
    expect(heroKey(null)).toBeNull();
    expect(heroKey("")).toBeNull();
  });

  it("URL que não é de herói vira null", () => {
    expect(heroKey("https://example.com/foo.jpg")).toBeNull();
    expect(
      heroKey("https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/blink.png"),
    ).toBeNull();
  });
});

describe("URLs da arte", () => {
  it("animação oficial do herói", () => {
    expect(heroRenderUrl("bloodseeker")).toBe(
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/bloodseeker.webm",
    );
  });

  it("imagem estática do herói (poster)", () => {
    expect(heroImageUrl("juggernaut")).toBe(
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/juggernaut.png",
    );
  });

  it("ilustração Radiant × Dire", () => {
    expect(ILLUSTRATION_URL).toBe(
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/home/radiant_dire5.jpg",
    );
  });
});

describe("HOME_HEROES", () => {
  it("12 heróis, sem repetição, com nome", () => {
    expect(HOME_HEROES).toHaveLength(12);
    expect(new Set(HOME_HEROES.map((h) => h.key)).size).toBe(12);
    for (const h of HOME_HEROES) expect(h.name.length).toBeGreaterThan(0);
  });
});

describe("rarityColor", () => {
  it("cores das raridades como no jogo", () => {
    expect(rarityColor("immortal")).toBe("#e4ae39");
    expect(rarityColor("mythical")).toBe("#8847ff");
    expect(rarityColor("rare")).toBe("#4b69ff");
    expect(rarityColor("arcana")).toBe("#ade55c");
  });

  it("raridade desconhecida usa a cor de common", () => {
    expect(rarityColor("seasonal")).toBe("#b0c3d9");
  });
});
