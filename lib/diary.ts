// Diário (v2.4): regras puras das notas por partida e do resumo.
// Sem server-only: o editor (cliente) também usa as etiquetas e os limites.

export const DEFAULT_TAGS: readonly string[] = [
  "Fase de rotas",
  "Farm",
  "Mortes evitáveis",
  "Posicionamento",
  "Lutas em equipe",
  "Visão",
  "Objetivos",
  "Rotações",
];

/** Os mesmos limites estão nos checks da tabela match_notes. */
export const NOTE_LIMITS = { text: 2000, tags: 12, tag: 30, items: 6, reason: 300, matchIds: 100 } as const;

export type MissingItem = { itemId: number; reason: string };

export type NoteInput = {
  goodTags: string[];
  badTags: string[];
  goodText: string;
  badText: string;
  missingItems: MissingItem[];
};

/** Nota salva: o conteúdo + dados da partida copiados ao salvar. */
export type Note = NoteInput & {
  matchId: number;
  heroId: number;
  won: boolean | null; // null = resultado indefinido
  playedAt: string; // ISO
  createdAt: string; // ISO
};

// ---------------------------------------------------------------------------
// Etiquetas

/** Apara e colapsa espaços. null = vazia ou com mais de 30 caracteres. */
export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().replace(/\s+/g, " ");
  return tag && tag.length <= NOTE_LIMITS.tag ? tag : null;
}

/** Chave de comparação: minúsculas e sem acentos ("Visão" = "visao"). */
export function tagKey(tag: string): string {
  return tag.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Grafia a gravar: a da lista fixa; senão a já usada pelo usuário; senão a digitada. */
export function canonicalTag(tag: string, known: string[]): string {
  const key = tagKey(tag);
  return (
    DEFAULT_TAGS.find((t) => tagKey(t) === key) ??
    known.find((t) => tagKey(t) === key) ??
    tag
  );
}

/** Etiquetas próprias do usuário (fora da lista fixa), distintas, da mais antiga para a mais nova. */
export function knownTags(notes: Note[]): string[] {
  const fixed = new Set(DEFAULT_TAGS.map(tagKey));
  const seen = new Set<string>();
  const out: string[] = [];
  const ordered = [...notes].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const n of ordered) {
    for (const t of [...n.goodTags, ...n.badTags]) {
      const key = tagKey(t);
      if (fixed.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validação do que o editor manda

type Parsed = { ok: true; note: NoteInput; empty: boolean } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseTags(raw: unknown, side: string, known: string[]): string[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return `Etiquetas de "${side}" inválidas.`;
  const out: string[] = [];
  const keys = new Set<string>();
  for (const t of raw) {
    if (typeof t !== "string") return `Etiquetas de "${side}" inválidas.`;
    const tag = normalizeTag(t);
    if (!tag) return `Cada etiqueta precisa ter de 1 a ${NOTE_LIMITS.tag} caracteres.`;
    const canon = canonicalTag(tag, known);
    const key = tagKey(canon);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(canon);
  }
  if (out.length > NOTE_LIMITS.tags) return `No máximo ${NOTE_LIMITS.tags} etiquetas em "${side}".`;
  return out;
}

function parseText(raw: unknown, side: string): string | { error: string } {
  if (raw === undefined) return "";
  if (typeof raw !== "string") return { error: `Texto de "${side}" inválido.` };
  const text = raw.trim();
  if (text.length > NOTE_LIMITS.text) {
    return { error: `O texto de "${side}" passa de ${NOTE_LIMITS.text} caracteres.` };
  }
  return text;
}

/**
 * Confere e normaliza a nota enviada pelo editor. Etiquetas ganham a grafia
 * canônica; etiqueta nos dois lados fica só em "deu errado" (o dado mais útil
 * para o resumo); item repetido conta uma vez.
 */
export function parseNoteInput(
  raw: unknown,
  ctx: { itemIds: Set<number>; known: string[] },
): Parsed {
  if (!isObject(raw)) return { ok: false, error: "Nota inválida." };

  const good = parseTags(raw.goodTags, "Deu certo", ctx.known);
  if (typeof good === "string") return { ok: false, error: good };
  const bad = parseTags(raw.badTags, "Deu errado", ctx.known);
  if (typeof bad === "string") return { ok: false, error: bad };
  const badKeys = new Set(bad.map(tagKey));
  const goodTags = good.filter((t) => !badKeys.has(tagKey(t)));

  const goodText = parseText(raw.goodText, "Deu certo");
  if (typeof goodText !== "string") return { ok: false, ...goodText };
  const badText = parseText(raw.badText, "Deu errado");
  if (typeof badText !== "string") return { ok: false, ...badText };

  const missingItems: MissingItem[] = [];
  if (raw.missingItems !== undefined) {
    if (!Array.isArray(raw.missingItems)) return { ok: false, error: "Itens inválidos." };
    if (raw.missingItems.length > NOTE_LIMITS.items) {
      return { ok: false, error: `No máximo ${NOTE_LIMITS.items} itens que faltaram.` };
    }
    for (const it of raw.missingItems) {
      if (!isObject(it) || typeof it.itemId !== "number" || !ctx.itemIds.has(it.itemId)) {
        return { ok: false, error: "Item desconhecido." };
      }
      const reason = it.reason === undefined ? "" : it.reason;
      if (typeof reason !== "string") return { ok: false, error: "Motivo do item inválido." };
      const r = reason.trim();
      if (r.length > NOTE_LIMITS.reason) {
        return { ok: false, error: `O motivo passa de ${NOTE_LIMITS.reason} caracteres.` };
      }
      if (missingItems.some((m) => m.itemId === it.itemId)) continue;
      missingItems.push({ itemId: it.itemId, reason: r });
    }
  }

  const note: NoteInput = { goodTags, badTags: bad, goodText, badText, missingItems };
  const empty =
    goodTags.length === 0 && bad.length === 0 && !goodText && !badText && missingItems.length === 0;
  return { ok: true, note, empty };
}

// ---------------------------------------------------------------------------
// Filtros do resumo (vêm da URL)

export type Period = 7 | 30 | 90 | "tudo";
export type DiaryFilter = { period: Period; heroId: number | null; matchIds: number[] | null };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const positiveInt = (s: string) => (/^\d{1,19}$/.test(s) && Number(s) > 0 ? Number(s) : null);

export function parseDiaryFilter(sp: Record<string, string | string[] | undefined>): DiaryFilter {
  const p = first(sp.periodo);
  const period: Period = p === "7" ? 7 : p === "90" ? 90 : p === "tudo" ? "tudo" : 30;
  const h = first(sp.heroi);
  const heroId = h ? positiveInt(h) : null;
  const ids: number[] = [];
  for (const part of (first(sp.partidas) ?? "").split(",")) {
    const id = positiveInt(part.trim());
    if (id !== null && !ids.includes(id)) ids.push(id);
    if (ids.length === NOTE_LIMITS.matchIds) break;
  }
  return { period, heroId, matchIds: ids.length > 0 ? ids : null };
}

/**
 * Notas do período e do período anterior de mesmo tamanho (para as setas).
 * Partidas escolhidas a dedo ignoram período e herói e não têm anterior;
 * "tudo" também não tem anterior.
 */
export function selectNotes(
  notes: Note[],
  f: DiaryFilter,
  nowMs: number,
): { current: Note[]; previous: Note[] | null } {
  if (f.matchIds) {
    const ids = new Set(f.matchIds);
    return { current: notes.filter((n) => ids.has(n.matchId)), previous: null };
  }
  const byHero = f.heroId === null ? notes : notes.filter((n) => n.heroId === f.heroId);
  if (f.period === "tudo") return { current: byHero, previous: null };
  const span = f.period * 86_400_000;
  const at = (n: Note) => Date.parse(n.playedAt);
  return {
    current: byHero.filter((n) => at(n) > nowMs - span),
    previous: byHero.filter((n) => at(n) <= nowMs - span && at(n) > nowMs - 2 * span),
  };
}

// ---------------------------------------------------------------------------
// Resumo

export type Trend = "up" | "down" | "same" | "new" | null;

export type TagText = { matchId: number; heroId: number; won: boolean | null; playedAt: string; text: string };

export type TagStat = {
  tag: string;
  count: number; // em quantas notas aparece
  wins: number;
  decided: number; // notas com resultado conhecido (base da taxa de vitória)
  trend: Trend;
  before: { count: number; total: number } | null;
  texts: TagText[];
};

export type ItemStat = { itemId: number; count: number; reasons: string[] };

export type DiarySummary = {
  total: number;
  wins: number;
  losses: number;
  good: TagStat[];
  bad: TagStat[];
  items: ItemStat[];
  // textos escritos num lado sem nenhuma etiqueta naquele lado (senão sumiriam do resumo)
  untaggedGood: TagText[];
  untaggedBad: TagText[];
};

const TREND_TOLERANCE = 0.05; // 5 pontos percentuais
const MIN_PREVIOUS = 3; // menos notas que isso no período anterior: sem setas

const newestFirst = (a: Note, b: Note) => Date.parse(b.playedAt) - Date.parse(a.playedAt);

function sideStats(
  current: Note[],
  previous: Note[] | null,
  side: "good" | "bad",
): TagStat[] {
  const tagsOf = (n: Note) => (side === "good" ? n.goodTags : n.badTags);
  const textOf = (n: Note) => (side === "good" ? n.goodText : n.badText);
  const stats = new Map<string, TagStat>();
  const latest = new Map<string, number>(); // partida mais recente com a etiqueta

  for (const n of [...current].sort(newestFirst)) {
    for (const tag of tagsOf(n)) {
      const key = tagKey(tag);
      let s = stats.get(key);
      if (!s) {
        s = { tag, count: 0, wins: 0, decided: 0, trend: null, before: null, texts: [] };
        stats.set(key, s);
        latest.set(key, Date.parse(n.playedAt));
      }
      s.count += 1;
      if (n.won !== null) {
        s.decided += 1;
        if (n.won) s.wins += 1;
      }
      const text = textOf(n);
      if (text) s.texts.push({ matchId: n.matchId, heroId: n.heroId, won: n.won, playedAt: n.playedAt, text });
    }
  }

  const compare = previous !== null && previous.length >= MIN_PREVIOUS;
  const out: TagStat[] = [];
  for (const [key, s] of stats) {
    if (compare) {
      const prevCount = previous.filter((n) => tagsOf(n).some((t) => tagKey(t) === key)).length;
      s.before = { count: prevCount, total: previous.length };
      if (prevCount === 0) s.trend = "new";
      else {
        const diff = s.count / current.length - prevCount / previous.length;
        s.trend = Math.abs(diff) < TREND_TOLERANCE ? "same" : diff > 0 ? "up" : "down";
      }
    }
    out.push(s);
  }
  // mais ocorrências primeiro; empate: a que apareceu mais recentemente
  const at = (t: TagStat) => latest.get(tagKey(t.tag)) ?? 0;
  return out.sort((a, b) => b.count - a.count || at(b) - at(a));
}

function untagged(current: Note[], side: "good" | "bad"): TagText[] {
  return [...current]
    .sort(newestFirst)
    .filter((n) => (side === "good" ? n.goodTags : n.badTags).length === 0)
    .map((n) => ({
      matchId: n.matchId,
      heroId: n.heroId,
      won: n.won,
      playedAt: n.playedAt,
      text: side === "good" ? n.goodText : n.badText,
    }))
    .filter((t) => t.text);
}

export function summarize(current: Note[], previous: Note[] | null): DiarySummary {
  const items = new Map<number, ItemStat>();
  const itemLatest = new Map<number, number>();
  for (const n of [...current].sort(newestFirst)) {
    for (const it of n.missingItems) {
      let s = items.get(it.itemId);
      if (!s) {
        s = { itemId: it.itemId, count: 0, reasons: [] };
        items.set(it.itemId, s);
        itemLatest.set(it.itemId, Date.parse(n.playedAt));
      }
      s.count += 1;
      if (it.reason) s.reasons.push(it.reason);
    }
  }
  return {
    total: current.length,
    wins: current.filter((n) => n.won === true).length,
    losses: current.filter((n) => n.won === false).length,
    good: sideStats(current, previous, "good"),
    bad: sideStats(current, previous, "bad"),
    items: [...items.values()].sort(
      (a, b) => b.count - a.count || (itemLatest.get(b.itemId) ?? 0) - (itemLatest.get(a.itemId) ?? 0),
    ),
    untaggedGood: untagged(current, "good"),
    untaggedBad: untagged(current, "bad"),
  };
}

/** Heróis com nota (para o filtro), mais notas primeiro. */
export function heroOptions(notes: Note[]): { heroId: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const n of notes) counts.set(n.heroId, (counts.get(n.heroId) ?? 0) + 1);
  return [...counts].map(([heroId, count]) => ({ heroId, count })).sort((a, b) => b.count - a.count);
}
