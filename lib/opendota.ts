import "server-only";
import { cacheLife } from "next/cache";

const BASE_URL = "https://api.opendota.com/api";
const TIMEOUT_MS = 8000;
const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com";

export type Hero = {
  id: number;
  name: string; // nome localizado, ex.: "Anti-Mage"
  img: string; // URL absoluta da imagem horizontal (256x144)
};

export type PlayerProfile = {
  account_id: number;
  personaname: string | null;
  avatarmedium: string | null;
  profileurl: string | null;
};

export type RecentMatch = {
  match_id: number;
  player_slot: number;
  radiant_win: boolean | null;
  hero_id: number;
  start_time: number;
  duration: number;
  kills: number;
  deaths: number;
  assists: number;
  gold_per_min: number;
  xp_per_min: number;
  last_hits: number;
};

/** Habilidade de item (texto da OpenDota, em inglês). */
export type ItemAbility = { type: string; title: string; description: string };

/** Item resolvido: nome, imagem e o que ele faz (para o preview no hover). */
export type Item = {
  id: number;
  name: string;
  img: string;
  cost: number | null; // null = sem custo (neutros, encantamentos)
  stats: string[]; // ex.: "+ 25 Strength"
  abilities: ItemAbility[];
  cooldown: number | null; // segundos
  manaCost: number | null;
};

/** Cosmético usado na partida (só em partidas processadas pela OpenDota). */
export type Cosmetic = {
  name: string;
  rarity: string; // "immortal", "mythical"… (padrão "common")
  img: string | null; // null = a OpenDota não tem o ícone
};

/** Unidade extra do jogador que carrega itens (urso do Lone Druid). */
export type MatchUnit = {
  name: string; // unitname da OpenDota, ex.: "spirit_bear"
  items: number[];
  backpack: number[];
  neutral: number[];
};

export type MatchPlayer = {
  account_id: number | null; // null = jogador anônimo
  personaname: string | null;
  player_slot: number;
  hero_id: number;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  last_hits: number;
  denies: number;
  gold_per_min: number;
  xp_per_min: number;
  net_worth: number | null;
  hero_damage: number | null;
  tower_damage: number | null;
  hero_healing: number | null;
  items: number[]; // item_0..item_5 (0 = vazio)
  backpack: number[]; // backpack_0..backpack_2
  neutral: number[]; // item_neutral + item_neutral2 (encantamento)
  units: MatchUnit[]; // additional_units: no Lone Druid os itens ficam no urso
  cosmetics: Cosmetic[];
};

export type MatchDetail = {
  match_id: number;
  start_time: number;
  duration: number;
  radiant_win: boolean | null;
  radiant_score: number;
  dire_score: number;
  players: MatchPlayer[];
};

export type OpenDotaErrorKind = "rate_limit" | "unavailable";

export class OpenDotaError extends Error {
  constructor(
    public kind: OpenDotaErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "OpenDotaError";
  }
}

/** Devolve o JSON, ou null em 404. Lança OpenDotaError nos demais problemas. */
async function request<T>(path: string, timeoutMs = TIMEOUT_MS): Promise<T | null> {
  // Uma linha por chamada REAL à API: é assim que se confere o cache (v1.3).
  console.info(`[OpenDota] GET ${path}`);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Erro de rede ou timeout.
    throw new OpenDotaError("unavailable", `Falha ao chamar ${path}: ${err}`);
  }

  if (res.status === 404) return null;
  if (res.status === 429) {
    throw new OpenDotaError("rate_limit", `429 em ${path}`);
  }
  if (!res.ok) {
    throw new OpenDotaError("unavailable", `HTTP ${res.status} em ${path}`);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new OpenDotaError("unavailable", `JSON inválido em ${path}`);
  }
}

/**
 * Pede à OpenDota para buscar de novo o perfil da conta na Steam (nome e
 * avatar). Ela não renova sozinha com frequência. Use com parcimônia: cada
 * pedido também a faz reprocessar o histórico da conta. Lança OpenDotaError.
 */
export async function requestPlayerRefresh(accountId: number): Promise<void> {
  const path = `/players/${accountId}/refresh`;
  console.info(`[OpenDota] POST ${path}`);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new OpenDotaError("unavailable", `Falha ao chamar ${path}: ${err}`);
  }
  if (res.status === 429) throw new OpenDotaError("rate_limit", `429 em ${path}`);
  if (!res.ok) throw new OpenDotaError("unavailable", `HTTP ${res.status} em ${path}`);
}

/** null = jogador não existe na OpenDota. */
export async function getPlayer(
  accountId: number,
): Promise<PlayerProfile | null> {
  const data = await request<{ profile?: PlayerProfile }>(
    `/players/${accountId}`,
  );
  return data?.profile ?? null;
}

export async function getRecentMatches(
  accountId: number,
): Promise<RecentMatch[]> {
  const data = await request<RecentMatch[]>(
    `/players/${accountId}/recentMatches`,
  );
  return Array.isArray(data) ? data.slice(0, 20) : [];
}

type RawHero = { id: number; localized_name: string; img: string };

/** Lista de heróis direto da API (sem cache — quem guarda é lib/data.ts). */
export async function getHeroesFromApi(): Promise<Hero[]> {
  const data = await request<Record<string, RawHero>>("/constants/heroes");
  if (!data) throw new OpenDotaError("unavailable", "constants/heroes vazio");
  return Object.values(data).map((h) => ({
    id: h.id,
    name: h.localized_name,
    img: cdnUrl(h.img),
  }));
}

// OpenDota devolve "/apps/dota2/.../blink.png?t=123" — tira a query string.
function cdnUrl(path: string): string {
  return STEAM_CDN + path.split("?")[0];
}

type RawItem = {
  id: number;
  dname?: string;
  img?: string;
  cost?: number | null;
  attrib?: { key: string; display?: string; value: string | number }[];
  abilities?: ItemAbility[];
  cd?: number | false;
  mc?: number | false;
};

// Número > 0 ou null (a OpenDota usa false/0 para "não tem").
const positive = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);

// /constants/items tem ~340 KB; o cache guarda só os campos usados.
async function fetchItems(): Promise<Record<number, Item>> {
  "use cache";
  cacheLife("days");

  const data = await request<Record<string, RawItem>>("/constants/items");
  if (!data) throw new OpenDotaError("unavailable", "constants/items vazio");

  const items: Record<number, Item> = {};
  for (const [key, it] of Object.entries(data)) {
    if (!it.img) continue;
    items[it.id] = {
      id: it.id,
      name: it.dname ?? key,
      img: cdnUrl(it.img),
      cost: positive(it.cost),
      // Só atributos com "display" são bônus visíveis; os outros são internos.
      stats: (it.attrib ?? [])
        .filter((a) => a.display)
        .map((a) => a.display!.replace("{value}", String(a.value)).trim()),
      abilities: (it.abilities ?? []).map(({ type, title, description }) => ({
        type,
        title,
        description: description.trim(),
      })),
      cooldown: positive(it.cd),
      manaCost: positive(it.mc),
    };
  }
  return items;
}

/** Mapa item_id → Item. Se a OpenDota falhar, devolve {} (itens viram "#id"). */
export async function getItems(): Promise<Record<number, Item>> {
  try {
    return await fetchItems();
  } catch (err) {
    console.error(err);
    return {};
  }
}

type RawMatchPlayer = Omit<MatchPlayer, "items" | "backpack" | "neutral" | "units"> &
  Record<string, unknown>;
type RawMatch = Omit<MatchDetail, "players"> & { players?: RawMatchPlayer[] };

type RawCosmetic = { name?: string; item_rarity?: string | null; image_path?: string | null };

// Copia só nome, raridade e ícone (o objeto original tem ~15 campos).
function toCosmetics(raw: unknown): Cosmetic[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawCosmetic[])
    .filter((c) => typeof c?.name === "string" && c.name.length > 0)
    .map((c) => ({
      name: c.name!,
      rarity: c.item_rarity || "common",
      img: c.image_path ? `${STEAM_CDN}/apps/570/${c.image_path}` : null,
    }));
}

const ITEM_KEYS = ["item_0", "item_1", "item_2", "item_3", "item_4", "item_5"];
const BACKPACK_KEYS = ["backpack_0", "backpack_1", "backpack_2"];
const NEUTRAL_KEYS = ["item_neutral", "item_neutral2"];
const slots = (p: Record<string, unknown>, keys: string[]) =>
  keys.map((k) => (typeof p[k] === "number" ? (p[k] as number) : 0));

// additional_units: mesmos campos de itens do jogador, um objeto por unidade.
function toUnits(raw: unknown): MatchUnit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (u): u is Record<string, unknown> =>
        u !== null && typeof u === "object" && typeof u.unitname === "string" && !!u.unitname,
    )
    .map((u) => ({
      name: u.unitname as string,
      items: slots(u, ITEM_KEYS),
      backpack: slots(u, BACKPACK_KEYS),
      neutral: slots(u, NEUTRAL_KEYS),
    }));
}

function toMatchDetail(data: RawMatch, players: RawMatchPlayer[]): MatchDetail {

  return {
    match_id: data.match_id,
    start_time: data.start_time,
    duration: data.duration,
    radiant_win: data.radiant_win ?? null,
    radiant_score: data.radiant_score,
    dire_score: data.dire_score,
    // Copia só os campos usados: o JSON original tem ~280 KB.
    players: players.map((p) => ({
      account_id: p.account_id ?? null,
      personaname: p.personaname ?? null,
      player_slot: p.player_slot,
      hero_id: p.hero_id,
      level: p.level,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      last_hits: p.last_hits,
      denies: p.denies,
      gold_per_min: p.gold_per_min,
      xp_per_min: p.xp_per_min,
      net_worth: p.net_worth ?? null,
      hero_damage: p.hero_damage ?? null,
      tower_damage: p.tower_damage ?? null,
      hero_healing: p.hero_healing ?? null,
      items: slots(p, ITEM_KEYS),
      backpack: slots(p, BACKPACK_KEYS),
      neutral: slots(p, NEUTRAL_KEYS),
      units: toUnits(p.additional_units),
      cosmetics: toCosmetics(p.cosmetics),
    })),
  };
}

/**
 * Partida direto da API (sem cache — quem guarda é lib/data.ts).
 * null = partida não existe (ou a OpenDota ainda não a conhece).
 */
export async function getMatch(matchId: number): Promise<MatchDetail | null> {
  const data = await request<RawMatch>(`/matches/${matchId}`);
  if (!data || !Array.isArray(data.players)) return null;
  return toMatchDetail(data, data.players);
}

// ---------------------------------------------------------------------------
// v2.1: pro players e times. Sem cache aqui: quem guarda é o banco
// (lib/pros-data.ts), renovado uma vez por dia.

// /proPlayers (~5.700 registros) e /teams (1.000) são respostas grandes.
const LIST_TIMEOUT_MS = 20000;

export type ProPlayer = {
  account_id: number;
  name: string; // nick de pro
  personaname: string | null; // nome atual na Steam
  avatar: string | null;
  team_id: number | null;
  team_name: string | null;
  team_tag: string | null;
  verified: boolean; // "is_locked": conta confirmada pela OpenDota
  last_match_time: string | null; // ISO
};

export type ProTeam = {
  team_id: number;
  name: string;
  tag: string | null;
  logo_url: string | null;
  rating: number; // Elo: começa em 1000
  last_match_time: number | null; // segundos Unix
};

export type TeamMember = {
  account_id: number;
  name: string | null;
  games_played: number;
  is_current_team_member: boolean | null;
};

const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const positiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;
// Datas conferidas aqui: um valor estranho num único registro faria o banco
// recusar o lote inteiro (coluna timestamptz) e a renovação nunca concluiria.
const isoDate = (v: unknown): string | null => {
  const s = text(v);
  return s !== null && !Number.isNaN(Date.parse(s)) ? s : null;
};
const MAX_UNIX_SECONDS = 4_102_444_800; // ano 2100
const unixSeconds = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v < MAX_UNIX_SECONDS ? v : null;

async function requestList(path: string): Promise<Record<string, unknown>[]> {
  const data = await request<unknown>(path, LIST_TIMEOUT_MS);
  if (!Array.isArray(data)) {
    throw new OpenDotaError("unavailable", `${path} não devolveu uma lista`);
  }
  // Itens que não são objeto (null, número) são lixo: ignora.
  return data.filter((x) => x !== null && typeof x === "object");
}

/** Todos os jogadores da lista de pros. Registros sem ID ou sem nick são pulados. */
export async function getProPlayers(): Promise<ProPlayer[]> {
  const list = await requestList("/proPlayers");
  const out: ProPlayer[] = [];
  const seen = new Set<number>(); // ID repetido no mesmo lote faria o upsert falhar
  for (const p of list) {
    const name = text(p.name);
    if (!positiveInt(p.account_id) || !name || seen.has(p.account_id)) continue;
    seen.add(p.account_id);
    out.push({
      account_id: p.account_id,
      name,
      personaname: text(p.personaname),
      avatar: text(p.avatarmedium),
      team_id: positiveInt(p.team_id) ? p.team_id : null,
      team_name: text(p.team_name),
      team_tag: text(p.team_tag),
      verified: p.is_locked === true,
      last_match_time: isoDate(p.last_match_time),
    });
  }
  return out;
}

/** Os times da OpenDota (vêm ordenados por rating). */
export async function getTeams(): Promise<ProTeam[]> {
  const list = await requestList("/teams");
  const out: ProTeam[] = [];
  const seen = new Set<number>();
  for (const t of list) {
    if (!positiveInt(t.team_id) || typeof t.rating !== "number" || seen.has(t.team_id)) continue;
    seen.add(t.team_id);
    out.push({
      team_id: t.team_id,
      name: text(t.name) ?? `Time ${t.team_id}`,
      tag: text(t.tag),
      logo_url: text(t.logo_url),
      rating: t.rating,
      last_match_time: unixSeconds(t.last_match_time),
    });
  }
  return out;
}

/** Todos que já jogaram pelo time; quem filtra o elenco atual é lib/pros.ts. */
export async function getTeamPlayers(teamId: number): Promise<TeamMember[]> {
  const data = await request<unknown>(`/teams/${teamId}/players`);
  if (!Array.isArray(data)) return []; // 404 ou corpo estranho: sem elenco
  const out: TeamMember[] = [];
  for (const m of data as Record<string, unknown>[]) {
    if (!m || !positiveInt(m.account_id)) continue;
    out.push({
      account_id: m.account_id,
      name: text(m.name),
      games_played: typeof m.games_played === "number" ? m.games_played : 0,
      is_current_team_member:
        typeof m.is_current_team_member === "boolean" ? m.is_current_team_member : null,
    });
  }
  return out;
}
