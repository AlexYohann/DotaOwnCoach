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
async function request<T>(path: string): Promise<T | null> {
  // Uma linha por chamada REAL à API: é assim que se confere o cache (v1.3).
  console.info(`[OpenDota] GET ${path}`);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
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

type RawMatchPlayer = Omit<MatchPlayer, "items" | "backpack" | "neutral"> &
  Record<string, unknown>;
type RawMatch = Omit<MatchDetail, "players"> & { players?: RawMatchPlayer[] };

function toMatchDetail(data: RawMatch, players: RawMatchPlayer[]): MatchDetail {
  const slots = (p: RawMatchPlayer, keys: string[]) =>
    keys.map((k) => (typeof p[k] === "number" ? (p[k] as number) : 0));

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
      items: slots(p, ["item_0", "item_1", "item_2", "item_3", "item_4", "item_5"]),
      backpack: slots(p, ["backpack_0", "backpack_1", "backpack_2"]),
      neutral: slots(p, ["item_neutral", "item_neutral2"]),
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
