import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createReadClient } from "@/lib/supabase/admin";
import {
  getProPlayers,
  getTeamPlayers,
  getTeams,
  OpenDotaError,
  type ProPlayer,
  type ProTeam,
} from "@/lib/opendota";
import {
  currentRoster,
  featuredTeams,
  normalizeNick,
  pickExample,
  safeLogoUrl,
  type ProSearchResult,
  type ProSuggestion,
} from "@/lib/pros";

// Pro players e times (v2.1). A lista da OpenDota fica copiada no Supabase e é
// renovada uma vez por dia pelo cron (/pros/refresh). A visita a /pros é só a
// rede de segurança. A busca nunca chama a OpenDota.

const PROS_TTL_MS = 24 * 60 * 60 * 1000; // lista em dia: 1 dia
const CLAIM_MS = 10 * 60 * 1000; // no máximo uma tentativa a cada 10 min
const EXAMPLE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // exemplo: jogou nos últimos 30 dias
// Menos que isso é falha parcial da OpenDota (hoje são ~5.700 e 1.000):
// gravar apagaria a lista boa.
const MIN_PLAYERS = 1000;
const MIN_TEAMS = 100;
const BATCH = 500;
const ROSTER_PAUSE_MS = 1100; // respeita o limite gratuito da OpenDota

export type FeaturedTeam = {
  teamId: number;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  rating: number;
  roster: {
    accountId: number;
    name: string;
    avatar: string | null;
    verified: boolean;
    lastMatchTime: string | null; // ISO
  }[];
};

export type RefreshOutcome =
  | { status: "done"; players: number; teams: number }
  | { status: "skipped"; reason: "claimed" | "no-admin" };

type Admin = SupabaseClient;
type RosterEntry = { account_id: number; name: string };
type Snapshot = {
  players: ProPlayer[];
  teams: ProTeam[];
  rosters: Map<number, RosterEntry[]>; // só os times em destaque
};

const logDb = (what: string, error: { code?: string; message?: string }) =>
  console.error(`[db] ${what}: ${error.code ?? ""} ${error.message ?? ""}`);

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Renovação

/**
 * "Reserva" a renovação: só passa se a última tentativa tem mais de 10 min.
 * É um UPDATE condicional, então duas visitas simultâneas não passam juntas.
 */
async function claimRefresh(admin: Admin): Promise<boolean> {
  const now = Date.now();
  const { data, error } = await admin
    .from("pros_refresh")
    .update({ attempted_at: new Date(now).toISOString() })
    .eq("id", true)
    .lt("attempted_at", new Date(now - CLAIM_MS).toISOString())
    .select("id");
  if (error) {
    logDb("reservar renovação dos pros", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/** Busca tudo na OpenDota. Só devolve se TODAS as chamadas deram certo. */
async function fetchSnapshot(): Promise<Snapshot> {
  const [players, teams] = await Promise.all([getProPlayers(), getTeams()]);
  if (players.length < MIN_PLAYERS || teams.length < MIN_TEAMS) {
    throw new OpenDotaError(
      "unavailable",
      `lista suspeita da OpenDota: ${players.length} pros, ${teams.length} times`,
    );
  }
  const rosters = new Map<number, RosterEntry[]>();
  const featured = featuredTeams(teams, Date.now());
  for (let i = 0; i < featured.length; i++) {
    if (i > 0) await pause(ROSTER_PAUSE_MS);
    const members = await getTeamPlayers(featured[i].team_id);
    rosters.set(featured[i].team_id, currentRoster(members));
  }
  return { players, teams, rosters };
}

async function upsertAll(admin: Admin, table: string, rows: object[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + BATCH));
    if (error) throw new Error(`gravar ${table}: ${error.code ?? ""} ${error.message ?? ""}`);
  }
}

/**
 * Grava o que veio e só então apaga o que saiu da lista. Qualquer erro lança
 * antes de apagar e antes de marcar como concluído.
 */
async function saveSnapshot(admin: Admin, snap: Snapshot, startedAt: string): Promise<void> {
  const teamRows = snap.teams.map((t) => ({
    team_id: t.team_id,
    name: t.name,
    tag: t.tag,
    logo_url: safeLogoUrl(t.logo_url),
    rating: t.rating,
    last_match_time:
      t.last_match_time === null ? null : new Date(t.last_match_time * 1000).toISOString(),
    roster: snap.rosters.get(t.team_id) ?? null,
    fetched_at: startedAt,
  }));
  const playerRows = snap.players.map((p) => ({
    account_id: p.account_id,
    name: p.name,
    name_norm: normalizeNick(p.name),
    personaname: p.personaname,
    avatar: p.avatar,
    team_id: p.team_id,
    team_name: p.team_name,
    team_tag: p.team_tag,
    verified: p.verified,
    last_match_time: p.last_match_time,
    fetched_at: startedAt,
  }));

  await upsertAll(admin, "pro_teams", teamRows);
  await upsertAll(admin, "pro_players", playerRows);
  // Quem não veio nesta renovação saiu da lista da OpenDota.
  for (const table of ["pro_teams", "pro_players"] as const) {
    const { error } = await admin.from(table).delete().lt("fetched_at", startedAt);
    if (error) throw new Error(`limpar ${table}: ${error.code ?? ""} ${error.message ?? ""}`);
  }
  const { error } = await admin
    .from("pros_refresh")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw new Error(`concluir renovação: ${error.code ?? ""} ${error.message ?? ""}`);
}

/**
 * Renova tudo (cron diário e rede de segurança). Lança se a OpenDota falhar,
 * vier lista suspeita ou a gravação der erro; nesses casos nada é apagado e a
 * lista continua "vencida" para a próxima tentativa.
 */
export async function refreshPros(): Promise<RefreshOutcome> {
  const admin = createAdminClient();
  if (!admin) return { status: "skipped", reason: "no-admin" };
  if (!(await claimRefresh(admin))) return { status: "skipped", reason: "claimed" };

  const startedAt = new Date().toISOString();
  const snap = await fetchSnapshot();
  await saveSnapshot(admin, snap, startedAt);
  return { status: "done", players: snap.players.length, teams: snap.teams.length };
}

// ---------------------------------------------------------------------------
// Times em destaque

type TeamRow = {
  team_id: number;
  name: string;
  tag: string | null;
  logo_url: string | null;
  rating: number;
  roster: RosterEntry[] | null;
};
type RosterPlayerRow = {
  account_id: number;
  avatar: string | null;
  verified: boolean;
  last_match_time: string | null;
};

/** Times em destaque salvos. null = erro de leitura; [] = ainda não há nada. */
async function readFeatured(): Promise<FeaturedTeam[] | null> {
  const read = createReadClient();
  const { data: teams, error } = await read
    .from("pro_teams")
    .select("team_id, name, tag, logo_url, rating, roster")
    .not("roster", "is", null)
    .order("rating", { ascending: false });
  if (error) {
    logDb("ler pro_teams", error);
    return null;
  }
  const rows = (teams ?? []) as TeamRow[];
  if (rows.length === 0) return [];

  const ids = rows.flatMap((t) => (t.roster ?? []).map((m) => m.account_id));
  const { data: pros, error: e2 } = await read
    .from("pro_players")
    .select("account_id, avatar, verified, last_match_time")
    .in("account_id", ids);
  if (e2) logDb("ler pro_players do elenco", e2); // segue sem avatar/selo
  const byId = new Map(((pros ?? []) as RosterPlayerRow[]).map((p) => [p.account_id, p]));

  return rows.map((t) => ({
    teamId: t.team_id,
    name: t.name,
    tag: t.tag,
    logoUrl: safeLogoUrl(t.logo_url),
    rating: t.rating,
    roster: (t.roster ?? []).map((m) => {
      const p = byId.get(m.account_id);
      return {
        accountId: m.account_id,
        name: m.name,
        avatar: p?.avatar ?? null,
        verified: p?.verified ?? false,
        lastMatchTime: p?.last_match_time ?? null,
      };
    }),
  }));
}

function snapshotToFeatured(snap: Snapshot): FeaturedTeam[] {
  const byId = new Map(snap.players.map((p) => [p.account_id, p]));
  return featuredTeams(snap.teams, Date.now()).map((t) => ({
    teamId: t.team_id,
    name: t.name,
    tag: t.tag,
    logoUrl: safeLogoUrl(t.logo_url),
    rating: t.rating,
    roster: (snap.rosters.get(t.team_id) ?? []).map((m) => {
      const p = byId.get(m.account_id);
      return {
        accountId: m.account_id,
        name: m.name,
        avatar: p?.avatar ?? null,
        verified: p?.verified ?? false,
        lastMatchTime: p?.last_match_time ?? null,
      };
    }),
  }));
}

/** A lista passou de 1 dia (ou nunca foi concluída)? Erro de leitura = não renova. */
async function isStale(admin: Admin): Promise<boolean> {
  const { data, error } = await admin
    .from("pros_refresh")
    .select("completed_at")
    .maybeSingle<{ completed_at: string | null }>();
  if (error) {
    logDb("ler pros_refresh", error);
    return false;
  }
  const completedAt = data?.completed_at;
  return !completedAt || Date.now() - new Date(completedAt).getTime() >= PROS_TTL_MS;
}

/**
 * Times em destaque para /pros. Banco primeiro; vencido → responde com o que
 * há e renova depois da resposta; vazio → busca na OpenDota na hora.
 * Lança OpenDotaError se não há nada salvo e não deu para buscar.
 */
export async function getFeaturedTeams(): Promise<FeaturedTeam[]> {
  const admin = createAdminClient();
  // As duas leituras saem juntas: a página não espera uma depois da outra.
  const [saved, stale] = await Promise.all([
    readFeatured(),
    admin ? isStale(admin) : false,
  ]);

  if (saved && saved.length > 0) {
    if (admin && stale) {
      after(() =>
        refreshPros().then(
          () => {},
          (err) => console.error("[pros] renovação falhou:", err),
        ),
      );
    }
    return saved;
  }

  // Nada salvo (primeira vez, ou banco fora). Com secret key, só um visitante
  // por vez busca; os outros veem a mensagem de erro por alguns instantes.
  if (admin && !(await claimRefresh(admin))) {
    throw new OpenDotaError("unavailable", "lista de pros sendo carregada");
  }
  const startedAt = new Date().toISOString();
  const snap = await fetchSnapshot();
  if (admin) {
    after(() =>
      saveSnapshot(admin, snap, startedAt).catch((err) =>
        console.error("[pros] gravação inicial falhou:", err),
      ),
    );
  }
  return snapshotToFeatured(snap);
}

// ---------------------------------------------------------------------------
// Busca, exemplo e identidade de pro

type SearchRow = {
  account_id: number;
  name: string;
  avatar: string | null;
  team_name: string | null;
  team_tag: string | null;
  logo_url: string | null;
  last_match_time: string | null;
  verified: boolean;
};

/** q já passou por cleanQuery (lib/pros.ts). Nunca lança. */
export async function searchPros(q: string): Promise<ProSearchResult> {
  const { data, error } = await createReadClient().rpc("search_pros", { q });
  if (error) {
    logDb("search_pros", error);
    return { verified: [], others: [] };
  }
  const all: ProSuggestion[] = ((data ?? []) as SearchRow[]).map((r) => ({
    accountId: r.account_id,
    name: r.name,
    avatar: r.avatar,
    teamName: r.team_name,
    teamTag: r.team_tag,
    teamLogo: safeLogoUrl(r.logo_url),
    lastMatchTime: r.last_match_time,
    verified: r.verified,
  }));
  return {
    verified: all.filter((p) => p.verified),
    others: all.filter((p) => !p.verified),
  };
}

/**
 * Jogador para "Ver um exemplo": verificado, do elenco de um time em destaque,
 * com partida nos últimos 30 dias (para nunca abrir uma tela vazia).
 * null = sem candidato ou erro. Nunca lança.
 */
export async function getExampleAccountId(
  random: () => number = Math.random,
): Promise<number | null> {
  try {
    const teams = await getFeaturedTeams();
    const cutoff = Date.now() - EXAMPLE_MAX_AGE_MS;
    const candidates = teams
      .flatMap((t) => t.roster)
      .filter(
        (p) =>
          p.verified &&
          p.lastMatchTime !== null &&
          new Date(p.lastMatchTime).getTime() >= cutoff,
      )
      .map((p) => p.accountId);
    return pickExample(candidates, random);
  } catch (err) {
    console.warn("[pros] sem exemplo:", err);
    return null;
  }
}

/**
 * Linha "Pro: …" da página do jogador. Só para verificados: um homônimo não
 * pode ser apresentado como o profissional. Nunca lança.
 */
export async function getVerifiedPro(
  accountId: number,
): Promise<{ name: string; teamName: string | null } | null> {
  const { data, error } = await createReadClient()
    .from("pro_players")
    .select("name, team_name, verified")
    .eq("account_id", accountId)
    .maybeSingle<{ name: string; team_name: string | null; verified: boolean }>();
  if (error) {
    logDb("ler pro_players", error);
    return null;
  }
  return data?.verified ? { name: data.name, teamName: data.team_name } : null;
}
