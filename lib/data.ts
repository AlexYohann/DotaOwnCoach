import "server-only";
import { after } from "next/server";
import { createAdminClient, createReadClient } from "@/lib/supabase/admin";
import {
  getHeroesFromApi,
  getMatch,
  getPlayer,
  getRecentMatches,
  OpenDotaError,
  type Hero,
  type MatchDetail,
  type PlayerProfile,
  type RecentMatch,
} from "@/lib/opendota";

// Cache no Supabase (v1.3). Regra: banco primeiro; se vencido, OpenDota e grava.
// Falha do banco nunca derruba a página: cai no comportamento antigo (só API).

const PLAYER_TTL_MS = 10 * 60 * 1000; // perfil + partidas recentes: 10 min
const HEROES_TTL_MS = 24 * 60 * 60 * 1000; // heróis: 1 dia
// Versão do formato de matches.detail. Se o formato mudar (ex.: linha do tempo
// da v5), sobe este número e as partidas antigas são buscadas de novo.
const DETAIL_VERSION = 1;

/** De onde vieram os dados mostrados. */
export type Freshness = {
  source: "db" | "api" | "stale"; // stale = banco vencido, OpenDota falhou
  fetchedAt: Date;
};

const isFresh = (fetchedAt: string, ttl: number) =>
  Date.now() - new Date(fetchedAt).getTime() < ttl;

// PostgrestError vira "{}" no log do Next; extrai código e mensagem.
const logDb = (what: string, error: { code?: string; message?: string }) =>
  console.error(`[db] ${what}: ${error.code ?? ""} ${error.message ?? ""}`);

// ---------------------------------------------------------------------------
// Jogador + últimas 20 partidas

export type PlayerData = {
  profile: PlayerProfile;
  matches: RecentMatch[];
  freshness: Freshness;
};

type PlayerRow = {
  account_id: number;
  personaname: string | null;
  avatar: string | null;
  profile_url: string | null;
  fetched_at: string;
};

/** null = jogador não existe na OpenDota. Lança OpenDotaError se a API falhar sem dado salvo. */
export async function getPlayerData(
  accountId: number,
): Promise<PlayerData | null> {
  // As duas leituras saem juntas (uma ida ao banco em vez de duas em fila).
  // Se o perfil estiver vencido, a leitura das partidas ainda serve de reserva
  // para o caso "OpenDota fora".
  const [{ data, error }, savedMatches] = await Promise.all([
    createReadClient()
      .from("players")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle<PlayerRow>(),
    readRecentMatches(accountId),
  ]);
  let saved: PlayerRow | null = null;
  if (error) logDb("ler players", error);
  else saved = data;

  if (saved && savedMatches && isFresh(saved.fetched_at, PLAYER_TTL_MS)) {
    return {
      profile: rowToProfile(saved),
      matches: savedMatches,
      freshness: { source: "db", fetchedAt: new Date(saved.fetched_at) },
    };
  }

  try {
    const [profile, matches] = await Promise.all([
      getPlayer(accountId),
      getRecentMatches(accountId),
    ]);
    if (!profile) return null; // inexistente: não guarda nada
    // Grava depois de responder: o usuário não espera as 3 gravações em fila.
    after(() => savePlayer(profile, matches));
    return { profile, matches, freshness: { source: "api", fetchedAt: new Date() } };
  } catch (err) {
    // OpenDota falhou, mas temos dado antigo: melhor mostrar com aviso.
    if (saved && savedMatches && err instanceof OpenDotaError) {
      console.warn(`[data] OpenDota falhou (${err.kind}); servindo dado salvo`);
      return {
        profile: rowToProfile(saved),
        matches: savedMatches,
        freshness: { source: "stale", fetchedAt: new Date(saved.fetched_at) },
      };
    }
    throw err;
  }
}

function rowToProfile(row: PlayerRow): PlayerProfile {
  return {
    account_id: row.account_id,
    personaname: row.personaname,
    avatarmedium: row.avatar,
    profileurl: row.profile_url,
  };
}

type PlayerMatchRow = {
  match_id: number;
  start_time: string;
  player_slot: number;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  gold_per_min: number;
  xp_per_min: number;
  last_hits: number;
  matches: { radiant_win: boolean | null; duration: number } | null;
};

/** Últimas 20 do banco, no formato da API. null = erro de leitura. */
async function readRecentMatches(
  accountId: number,
): Promise<RecentMatch[] | null> {
  const { data, error } = await createReadClient()
    .from("player_matches")
    .select(
      "match_id, start_time, player_slot, hero_id, kills, deaths, assists, gold_per_min, xp_per_min, last_hits, matches(radiant_win, duration)",
    )
    .eq("account_id", accountId)
    .order("start_time", { ascending: false })
    .limit(20)
    .returns<PlayerMatchRow[]>();
  if (error) {
    logDb("ler player_matches", error);
    return null;
  }
  return data.map((r) => ({
    match_id: r.match_id,
    player_slot: r.player_slot,
    radiant_win: r.matches?.radiant_win ?? null,
    hero_id: r.hero_id,
    start_time: Math.floor(new Date(r.start_time).getTime() / 1000),
    duration: r.matches?.duration ?? 0,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    gold_per_min: r.gold_per_min,
    xp_per_min: r.xp_per_min,
    last_hits: r.last_hits,
  }));
}

/** Grava perfil + partidas. Erros só são registrados (a página segue). */
async function savePlayer(profile: PlayerProfile, matches: RecentMatch[]) {
  const admin = createAdminClient();
  if (!admin) {
    console.warn("[db] SUPABASE_SECRET_KEY ausente: nada será gravado");
    return;
  }
  const iso = (unix: number) => new Date(unix * 1000).toISOString();

  // Ordem importa por causa das chaves estrangeiras: players e matches antes.
  const { error: e1 } = await admin.from("players").upsert({
    account_id: profile.account_id,
    personaname: profile.personaname,
    avatar: profile.avatarmedium,
    profile_url: profile.profileurl,
    fetched_at: new Date().toISOString(),
  });
  if (e1) return logDb("gravar players", e1);
  if (matches.length === 0) return;

  // ignoreDuplicates: partida já salva (talvez com detail) não é tocada.
  const { error: e2 } = await admin.from("matches").upsert(
    matches.map((m) => ({
      match_id: m.match_id,
      start_time: iso(m.start_time),
      duration: m.duration,
      radiant_win: m.radiant_win,
    })),
    { onConflict: "match_id", ignoreDuplicates: true },
  );
  if (e2) return logDb("gravar matches", e2);

  const { error: e3 } = await admin.from("player_matches").upsert(
    matches.map((m) => ({
      account_id: profile.account_id,
      match_id: m.match_id,
      start_time: iso(m.start_time),
      player_slot: m.player_slot,
      hero_id: m.hero_id,
      kills: m.kills,
      deaths: m.deaths,
      assists: m.assists,
      gold_per_min: m.gold_per_min,
      xp_per_min: m.xp_per_min,
      last_hits: m.last_hits,
    })),
  );
  if (e3) logDb("gravar player_matches", e3);
}

// ---------------------------------------------------------------------------
// Detalhe da partida (imutável: busca uma vez, guarda para sempre)

type StoredDetail = { version: number; match: MatchDetail };

/** null = partida não existe. Lança OpenDotaError se a API falhar. */
export async function getMatchData(
  matchId: number,
): Promise<MatchDetail | null> {
  const { data, error } = await createReadClient()
    .from("matches")
    .select("detail")
    .eq("match_id", matchId)
    .maybeSingle<{ detail: StoredDetail | null }>();
  if (error) logDb("ler matches.detail", error);
  else if (data?.detail?.version === DETAIL_VERSION) return data.detail.match;

  const match = await getMatch(matchId);
  if (!match) return null;
  after(() => saveMatchDetail(match));
  return match;
}

async function saveMatchDetail(match: MatchDetail) {
  const admin = createAdminClient();
  if (!admin) return;
  const detail: StoredDetail = { version: DETAIL_VERSION, match };
  const { error } = await admin.from("matches").upsert({
    match_id: match.match_id,
    start_time: new Date(match.start_time * 1000).toISOString(),
    duration: match.duration,
    radiant_win: match.radiant_win,
    radiant_score: match.radiant_score,
    dire_score: match.dire_score,
    detail,
    detail_fetched_at: new Date().toISOString(),
  });
  if (error) logDb("gravar matches.detail", error);
}

// ---------------------------------------------------------------------------
// Heróis

/** Mapa hero_id → Hero. Nunca lança: se tudo falhar, devolve {} (página mostra hero_id). */
export async function getHeroes(): Promise<Record<number, Hero>> {
  const { data, error } = await createReadClient()
    .from("heroes")
    .select("id, name, img, updated_at")
    .returns<(Hero & { updated_at: string })[]>();
  if (error) logDb("ler heroes", error);

  const saved = data ?? [];
  const fresh =
    saved.length > 0 &&
    saved.every((h) => isFresh(h.updated_at, HEROES_TTL_MS));
  if (fresh) return toHeroMap(saved);

  try {
    const heroes = await getHeroesFromApi();
    after(async () => {
      const admin = createAdminClient();
      if (!admin) return;
      const now = new Date().toISOString();
      const { error: e } = await admin
        .from("heroes")
        .upsert(heroes.map((h) => ({ ...h, updated_at: now })));
      if (e) logDb("gravar heroes", e);
    });
    return toHeroMap(heroes);
  } catch (err) {
    console.error(err);
    return toHeroMap(saved); // lista antiga é melhor que nenhuma
  }
}

function toHeroMap(list: Hero[]): Record<number, Hero> {
  const map: Record<number, Hero> = {};
  for (const h of list) map[h.id] = { id: h.id, name: h.name, img: h.img };
  return map;
}
