import { describe, expect, it } from "vitest";
import { canSeeDiary, tabHref } from "@/lib/player-access";

describe("canSeeDiary", () => {
  it("só o dono logado vê o próprio diário", () => {
    expect(canSeeDiary(217152877, 217152877)).toBe(true);
    expect(canSeeDiary(5, 217152877)).toBe(false);
    expect(canSeeDiary(null, 217152877)).toBe(false);
  });
});

describe("tabHref", () => {
  it("partidas é a página do jogador; as outras são subpáginas", () => {
    expect(tabHref(7, "partidas")).toBe("/player/7");
    expect(tabHref(7, "parceiros")).toBe("/player/7/parceiros");
    expect(tabHref(7, "diario")).toBe("/player/7/diario");
  });
});
