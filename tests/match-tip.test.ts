import { describe, expect, it } from "vitest";
import { readTipDismissed, saveTipDismissed } from "@/lib/match-tip";

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

describe("dica da tela da partida", () => {
  it("nada salvo: a dica aparece", () => {
    expect(readTipDismissed(mem())).toBe(false);
  });

  it("dispensada, não volta", () => {
    const s = mem();
    saveTipDismissed(s);
    expect(readTipDismissed(s)).toBe(true);
    expect(s.getItem("dota-own-coach:match-tip")).toBe("dismissed");
  });

  it("sem armazenamento ou armazenamento bloqueado não derruba", () => {
    expect(readTipDismissed(null)).toBe(false);
    expect(readTipDismissed(broken)).toBe(false);
    expect(() => saveTipDismissed(broken)).not.toThrow();
    expect(() => saveTipDismissed(null)).not.toThrow();
  });
});
