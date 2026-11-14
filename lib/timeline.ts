// Linha do tempo do herói (v2.2): regras puras. Sem servidor — o componente
// cliente também usa este arquivo.

/** Uma compra do purchase_log. time em segundos; negativo = antes do sino. */
export type Purchase = { time: number; key: string };

/** Dados minuto a minuto de um jogador (índice = minuto; valores acumulados). */
export type Timeline = { gold: number[]; xp: number[]; purchases: Purchase[] };

/** O que a linha do tempo precisa de cada item (vem de getItems). */
export type ItemInfo = {
  key: string;
  name: string;
  img: string | null;
  cost: number | null;
  assembled: boolean; // tem receita/componentes
};

export type BigPurchase = { time: number; key: string; name: string; img: string | null; cost: number };

/** O que vai para o navegador: só as curvas e os itens grandes. */
export type ViewTimeline = { gold: number[]; xp: number[]; big: BigPurchase[] };

/** ready = mostrar; login = convite (deslogado); unparsed = pedir processamento. */
export type TimelineState = "ready" | "login" | "unparsed";

export const RHYTHM_WINDOW = 3; // minutos
export const BIG_ITEM_MIN_COST = 2000;

const lastIndex = (series: number[]) => series.length - 1;
const at = (series: number[], minute: number) =>
  Math.max(0, Math.min(Math.floor(minute), lastIndex(series)));

/**
 * Quanto o herói ganhou por minuto nos últimos 3 minutos. É o número que
 * mostra o efeito de um item (a média desde o começo sobe devagar demais).
 */
export function rhythm(series: number[], minute: number): number {
  const m = at(series, minute);
  if (m <= 0) return 0;
  const from = Math.max(0, m - RHYTHM_WINDOW);
  return Math.round((series[m] - series[from]) / (m - from));
}

/** Média desde o minuto 0: é o GPM/XPM que o Dota mostra. */
export function averageSoFar(series: number[], minute: number): number {
  const m = at(series, minute);
  if (m <= 0) return 0;
  return Math.round(series[m] / m);
}

/**
 * Itens grandes, em ordem de compra: montados e de 2.000 de ouro ou mais,
 * comprados depois do minuto 0. Intermediários (Yasha, Maelstrom) entram de
 * propósito — eles já mudam o farm. Item fora da lista é ignorado.
 */
export function bigPurchases(
  purchases: Purchase[],
  itemsByKey: Record<string, ItemInfo>,
): BigPurchase[] {
  const out: BigPurchase[] = [];
  for (const p of purchases) {
    const it = itemsByKey[p.key];
    if (!it || p.time <= 0 || !it.assembled) continue;
    if (it.cost === null || it.cost < BIG_ITEM_MIN_COST) continue;
    out.push({ time: p.time, key: p.key, name: it.name, img: it.img, cost: it.cost });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Ritmo no minuto da compra e 3 minutos depois (no máximo, o último minuto). */
export function beforeAfter(series: number[], timeSeconds: number): { before: number; after: number } {
  const m0 = Math.floor(timeSeconds / 60);
  const m1 = Math.min(m0 + RHYTHM_WINDOW, lastIndex(series));
  return { before: rhythm(series, m0), after: rhythm(series, m1) };
}

/** Teto redondo do eixo: passo de 500 até 1.600, de 1.000 acima. Mínimo 500. */
export function axisMax(values: number[]): { max: number; step: number } {
  const top = values.length ? Math.max(...values) : 0;
  const step = top > 1600 ? 1000 : 500;
  return { max: Math.max(step, Math.ceil(top / step) * step), step };
}

/**
 * Fileira de cada ícone (x em ordem crescente): 1 quando fica a menos de
 * minGap do último ícone da fileira 0, para não se sobreporem.
 */
export function markerRows(xs: number[], minGap: number): (0 | 1)[] {
  let lastOnBase = -Infinity;
  return xs.map((x) => {
    if (x - lastOnBase >= minGap) {
      lastOnBase = x;
      return 0;
    }
    return 1;
  });
}

const TICK_STEPS = [5, 10, 15, 20, 30];
const TICK_MIN_PX = 56; // largura de "15 min" com folga

/** Minutos com rótulo no eixo: o menor passo que não sobrepõe os rótulos. */
export function minuteTicks(lastMinute: number, plotWidth: number): number[] {
  const perMinute = plotWidth / Math.max(1, lastMinute);
  const step = TICK_STEPS.find((s) => s * perMinute >= TICK_MIN_PX) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const out: number[] = [];
  for (let m = 0; m <= Math.max(0, lastMinute); m += step) out.push(m);
  return out;
}

/** Primeiro minuto em que o item já aparece como fechado (12:20 → 13). */
export function purchaseMinute(timeSeconds: number): number {
  return Math.ceil(timeSeconds / 60);
}

/** Minuto inicial: o do primeiro item grande; sem item, o 10 (ou o último). */
export function defaultMinute(big: BigPurchase[], lastMinute: number): number {
  if (big.length > 0) return clampMinute(purchaseMinute(big[0].time), lastMinute);
  return Math.min(10, lastMinute);
}

export function clampMinute(minute: number, lastMinute: number): number {
  return Math.max(0, Math.min(Math.round(minute), lastMinute));
}

export function toViewTimeline(
  t: Timeline | null,
  itemsByKey: Record<string, ItemInfo>,
): ViewTimeline | null {
  if (!t) return null;
  return { gold: t.gold, xp: t.xp, big: bigPurchases(t.purchases, itemsByKey) };
}

/** A linha do tempo é só para quem está logado (decisão do Alex). */
export function timelineState(viewerId: number | null, parsed: boolean): TimelineState {
  if (viewerId === null) return "login";
  return parsed ? "ready" : "unparsed";
}
