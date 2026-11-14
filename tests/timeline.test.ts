import { describe, expect, it } from "vitest";
import {
  averageSoFar,
  axisMax,
  beforeAfter,
  bigPurchases,
  clampMinute,
  defaultMinute,
  markerRows,
  minuteTicks,
  rhythm,
  timelineState,
  toViewTimeline,
  type ItemInfo,
} from "@/lib/timeline";

// Dados reais: Anti-Mage do Yatoro, partida 9070527945, primeiros 20 minutos.
const GOLD = [0, 170, 559, 858, 1497, 2077, 2650, 3197, 3527, 4142, 4665, 5026, 5341, 6006, 6957, 7711, 8361, 8863, 10056, 10925];
const XP = [14, 14, 261, 437, 1218, 1478, 1977, 2523, 2703, 3201, 3716, 4168, 4363, 5195, 6547, 7206, 8251, 8960, 10716, 12002];

const ITEMS: Record<string, ItemInfo> = {
  bfury: { key: "bfury", name: "Battle Fury", img: "b.png", cost: 3900, assembled: true },
  power_treads: { key: "power_treads", name: "Power Treads", img: "p.png", cost: 1400, assembled: true },
  yasha: { key: "yasha", name: "Yasha", img: "y.png", cost: 2100, assembled: true },
  eagle: { key: "eagle", name: "Eaglesong", img: "e.png", cost: 2800, assembled: false },
  relic: { key: "relic", name: "Sacred Relic", img: null, cost: null, assembled: true },
  manta: { key: "manta", name: "Manta Style", img: "m.png", cost: 2000, assembled: true },
};
const LOG = [
  { time: 1107, key: "manta" },
  { time: 756, key: "bfury" },
  { time: 266, key: "power_treads" },
  { time: 907, key: "yasha" },
  { time: 1246, key: "eagle" },
  { time: 300, key: "relic" },
  { time: 400, key: "item_que_nao_existe" },
  { time: -90, key: "bfury" },
  { time: 0, key: "yasha" },
];

describe("rhythm (ganho por minuto nos últimos 3 minutos)", () => {
  it("bate com a conta feita à mão na partida real", () => {
    expect([0, 1, 2, 3, 12, 15, 16].map((m) => rhythm(GOLD, m))).toEqual([0, 170, 280, 286, 400, 790, 785]);
    expect(rhythm(XP, 16)).toBe(1019);
  });

  it("minuto fora da partida não quebra", () => {
    expect(rhythm(GOLD, -1)).toBe(0);
    expect(rhythm(GOLD, 99)).toBe(rhythm(GOLD, 19)); // além do fim = último minuto
    expect(rhythm([0, 300], 1)).toBe(300); // partida de 1 minuto
    expect(rhythm([], 0)).toBe(0);
  });
});

describe("averageSoFar (o GPM/XPM que o Dota mostra)", () => {
  it("média desde o começo", () => {
    expect([0, 1, 12, 16].map((m) => averageSoFar(GOLD, m))).toEqual([0, 170, 445, 523]);
    expect(averageSoFar(XP, 16)).toBe(516);
  });

  it("lista vazia não divide por zero", () => {
    expect(averageSoFar([], 3)).toBe(0);
  });
});

describe("bigPurchases (item grande = montado e custa 2.000 ou mais)", () => {
  it("só itens grandes, depois do minuto 0, em ordem de compra", () => {
    expect(bigPurchases(LOG, ITEMS).map((p) => [p.key, p.time])).toEqual([
      ["bfury", 756],
      ["yasha", 907],
      ["manta", 1107],
    ]);
    expect(bigPurchases(LOG, ITEMS)[0]).toEqual({ time: 756, key: "bfury", name: "Battle Fury", img: "b.png", cost: 3900 });
  });

  it("lista de itens vazia (getItems falhou): sem ícones, sem erro", () => {
    expect(bigPurchases(LOG, {})).toEqual([]);
  });
});

describe("beforeAfter (ritmo na compra e três minutos depois)", () => {
  it("Battle Fury aos 12:36 → minutos 12 e 15", () => {
    expect(beforeAfter(GOLD, 756)).toEqual({ before: 400, after: 790 });
  });

  it("perto do fim, o depois para no último minuto", () => {
    expect(beforeAfter(GOLD, 18 * 60 + 30)).toEqual({ before: rhythm(GOLD, 18), after: rhythm(GOLD, 19) });
  });
});

describe("axisMax (teto redondo do eixo)", () => {
  it("passo 500 até 1.600 de máximo, 1.000 acima", () => {
    expect(axisMax([0, 785, 1381])).toEqual({ max: 1500, step: 500 });
    expect(axisMax([0, 2152])).toEqual({ max: 3000, step: 1000 });
  });

  it("sem valores ou tudo zero: eixo mínimo de 500", () => {
    expect(axisMax([])).toEqual({ max: 500, step: 500 });
    expect(axisMax([0, 0])).toEqual({ max: 500, step: 500 });
  });
});

describe("markerRows (ícones próximos sobem para a 2ª fileira)", () => {
  it("compara com o último ícone da fileira de baixo", () => {
    expect(markerRows([10, 100, 120, 300, 310, 320], 36)).toEqual([0, 0, 1, 0, 1, 1]);
    expect(markerRows([], 36)).toEqual([]);
  });
});

describe("minuteTicks (rótulos do eixo dos minutos sem se sobrepor)", () => {
  it("de 5 em 5 quando cabe; passo maior em tela estreita", () => {
    expect(minuteTicks(47, 900)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45]); // ~96 px cada
    // celular: de 5 em 5 dariam 34 px (sobrepõe); de 10 em 10, 69 px (≥ 56)
    expect(minuteTicks(47, 323)).toEqual([0, 10, 20, 30, 40]);
    expect(minuteTicks(90, 260)).toEqual([0, 20, 40, 60, 80]); // partida longa em tela estreita
  });

  it("partida curtíssima: só o 0 e nunca passo zero", () => {
    expect(minuteTicks(1, 300)).toEqual([0]);
    expect(minuteTicks(0, 300)).toEqual([0]);
  });
});

describe("defaultMinute / clampMinute", () => {
  it("começa no primeiro item grande; sem item, no minuto 10 (ou no fim)", () => {
    expect(defaultMinute([{ time: 756, key: "bfury", name: "", img: null, cost: 3900 }], 47)).toBe(13);
    expect(defaultMinute([], 47)).toBe(10);
    expect(defaultMinute([], 4)).toBe(4);
  });

  it("limita e arredonda", () => {
    expect(clampMinute(-3, 47)).toBe(0);
    expect(clampMinute(99, 47)).toBe(47);
    expect(clampMinute(12.6, 47)).toBe(13);
  });
});

describe("toViewTimeline", () => {
  it("sem dados → null; com dados → curvas + itens grandes", () => {
    expect(toViewTimeline(null, ITEMS)).toBeNull();
    expect(toViewTimeline({ gold: GOLD, xp: XP, purchases: LOG }, ITEMS)).toEqual({
      gold: GOLD,
      xp: XP,
      big: bigPurchases(LOG, ITEMS),
    });
  });
});

describe("timelineState (só para quem está logado)", () => {
  it("deslogado nunca vê, nem em partida processada", () => {
    expect(timelineState(null, true)).toBe("login");
    expect(timelineState(null, false)).toBe("login");
  });

  it("logado: pronta ou ainda não processada", () => {
    expect(timelineState(7, true)).toBe("ready");
    expect(timelineState(7, false)).toBe("unparsed");
  });
});
