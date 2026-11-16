import "server-only";
import type { MissingItem, Note, NoteInput } from "@/lib/diary";
import { createClient } from "@/lib/supabase/server";

// Diário (v2.4). Tudo aqui usa o cliente DA SESSÃO (cookies), nunca o admin:
// o RLS de match_notes garante no banco que cada um só lê e mexe nas próprias
// notas. Por isso as leituras nem filtram por usuário — o banco filtra.
// Nada aqui lança: erro do banco vira null/[]/false e uma linha no log.

type NoteRow = {
  match_id: number;
  hero_id: number;
  won: boolean | null;
  played_at: string;
  created_at: string;
  good_tags: string[] | null;
  bad_tags: string[] | null;
  good_text: string | null;
  bad_text: string | null;
  missing_items: { item_id?: unknown; reason?: unknown }[] | null;
};

const COLUMNS =
  "match_id, hero_id, won, played_at, created_at, good_tags, bad_tags, good_text, bad_text, missing_items";
// O PostgREST do Supabase devolve no máximo 1.000 linhas por consulta (Max rows):
// pedir mais não traz mais. Quem passar disso vê as 1.000 mais recentes.
const MAX_NOTES = 1000;

const logDb = (what: string, error: { code?: string; message?: string }) =>
  console.error(`[db] ${what}: ${error.code ?? ""} ${error.message ?? ""}`);

export function rowToNote(r: NoteRow): Note {
  const items: MissingItem[] = [];
  for (const it of Array.isArray(r.missing_items) ? r.missing_items : []) {
    if (typeof it?.item_id === "number") {
      items.push({ itemId: it.item_id, reason: typeof it.reason === "string" ? it.reason : "" });
    }
  }
  return {
    matchId: Number(r.match_id),
    heroId: r.hero_id,
    won: r.won,
    playedAt: r.played_at,
    createdAt: r.created_at,
    goodTags: r.good_tags ?? [],
    badTags: r.bad_tags ?? [],
    goodText: r.good_text ?? "",
    badText: r.bad_text ?? "",
    missingItems: items,
  };
}

/** A nota de quem está logado nesta partida, ou null. */
export async function getMyNote(matchId: number): Promise<Note | null> {
  const { data, error } = await (await createClient())
    .from("match_notes")
    .select(COLUMNS)
    .eq("match_id", matchId)
    .maybeSingle<NoteRow>();
  if (error) {
    logDb("ler match_notes (partida)", error);
    return null;
  }
  return data ? rowToNote(data) : null;
}

/** Todas as notas de quem está logado, mais recentes primeiro (até 1.000). */
export async function getMyNotes(): Promise<Note[]> {
  const { data, error } = await (await createClient())
    .from("match_notes")
    .select(COLUMNS)
    .order("played_at", { ascending: false })
    .limit(MAX_NOTES)
    .returns<NoteRow[]>();
  if (error) {
    logDb("ler match_notes", error);
    return [];
  }
  return data.map(rowToNote);
}

/**
 * Só as etiquetas (e a data de criação) das notas de quem está logado: o
 * bastante para knownTags, sem trazer os textos. Mais antigas primeiro.
 */
export async function getMyTagNotes(): Promise<Note[]> {
  const { data, error } = await (await createClient())
    .from("match_notes")
    .select("match_id, good_tags, bad_tags, created_at")
    .order("created_at", { ascending: true })
    .limit(MAX_NOTES)
    .returns<Pick<NoteRow, "match_id" | "good_tags" | "bad_tags" | "created_at">[]>();
  if (error) {
    logDb("ler etiquetas de match_notes", error);
    return [];
  }
  return data.map((r) =>
    rowToNote({
      ...r,
      hero_id: 0,
      won: null,
      played_at: r.created_at,
      good_text: "",
      bad_text: "",
      missing_items: [],
    }),
  );
}

/** Notas de quem está logado nessas partidas (tabela de "Últimas partidas"). */
export async function getMyNotesFor(matchIds: number[]): Promise<Map<number, Note>> {
  const out = new Map<number, Note>();
  if (matchIds.length === 0) return out;
  const { data, error } = await (await createClient())
    .from("match_notes")
    .select(COLUMNS)
    .in("match_id", matchIds)
    .returns<NoteRow[]>();
  if (error) {
    logDb("ler match_notes (tabela)", error);
    return out;
  }
  for (const r of data) out.set(Number(r.match_id), rowToNote(r));
  return out;
}

export type NoteMeta = { matchId: number; heroId: number; won: boolean | null; playedAt: string };

/** Cria ou substitui a nota. userId/accountId vêm da sessão (o RLS confere de novo). */
export async function saveMyNote(
  userId: string,
  accountId: number,
  meta: NoteMeta,
  note: NoteInput,
): Promise<Note | null> {
  const { data, error } = await (await createClient())
    .from("match_notes")
    .upsert(
      {
        user_id: userId,
        match_id: meta.matchId,
        account_id: accountId,
        hero_id: meta.heroId,
        won: meta.won,
        played_at: meta.playedAt,
        good_tags: note.goodTags,
        bad_tags: note.badTags,
        good_text: note.goodText,
        bad_text: note.badText,
        missing_items: note.missingItems.map((m) => ({ item_id: m.itemId, reason: m.reason })),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,match_id" },
    )
    .select(COLUMNS)
    .single<NoteRow>();
  if (error) {
    logDb("gravar match_notes", error);
    return null;
  }
  return rowToNote(data);
}

/** Apaga a nota de quem está logado nesta partida. true = apagada (ou já não existia). */
export async function deleteMyNote(matchId: number): Promise<boolean> {
  const { error } = await (await createClient()).from("match_notes").delete().eq("match_id", matchId);
  if (error) {
    logDb("apagar match_notes", error);
    return false;
  }
  return true;
}
