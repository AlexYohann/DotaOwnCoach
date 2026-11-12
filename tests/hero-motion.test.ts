import { describe, expect, it } from "vitest";
import { HERO_MOTION_EVENT, readHeroMotion, saveHeroMotion } from "@/lib/hero-art";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const broken = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("preferência de animação do herói", () => {
  it("nome do evento que avisa a troca (banner ↔ menu da conta)", () => {
    expect(HERO_MOTION_EVENT).toBe("dota-own-coach:hero-motion");
  });

  it("padrão: animando (mesmo sem nada salvo)", () => {
    expect(readHeroMotion(mem())).toBe("playing");
  });

  it("guarda a pausa e lê de volta", () => {
    const s = mem();
    saveHeroMotion(s, "paused");
    expect(readHeroMotion(s)).toBe("paused");
    saveHeroMotion(s, "playing");
    expect(readHeroMotion(s)).toBe("playing");
  });

  it("valor desconhecido salvo: animando", () => {
    const s = mem();
    s.setItem("dota-own-coach:hero-motion", "xyz");
    expect(readHeroMotion(s)).toBe("playing");
  });

  it("armazenamento bloqueado ou ausente não lança", () => {
    expect(readHeroMotion(broken)).toBe("playing");
    expect(readHeroMotion(null)).toBe("playing");
    expect(() => saveHeroMotion(broken, "paused")).not.toThrow();
    expect(() => saveHeroMotion(null, "paused")).not.toThrow();
  });
});
