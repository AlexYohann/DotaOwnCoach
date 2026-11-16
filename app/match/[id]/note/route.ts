import { NextResponse, type NextRequest } from "next/server";
import { getViewerSession } from "@/lib/account";
import { getItems, getMatchData } from "@/lib/data";
import { knownTags, parseNoteInput } from "@/lib/diary";
import { isWin } from "@/lib/match";
import { deleteMyNote, getMyNotes, saveMyNote } from "@/lib/notes-data";
import { OpenDotaError } from "@/lib/opendota";

// Nota do diário (v2.4) de quem está logado nesta partida.
//   PUT    → cria ou substitui (nota vazia = apaga)
//   DELETE → apaga
// Quem é o autor vem SÓ da sessão; o corpo nunca diz de quem é a nota. Além
// disso, o RLS de match_notes confere o dono no banco (a gravação usa o
// cliente da sessão, não a secret key).
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

async function matchIdFrom(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  return /^\d{1,19}$/.test(id) ? Number(id) : null;
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const session = await getViewerSession();
  if (!session) return reply({ error: "Entre com a Steam para anotar." }, 401);
  const matchId = await matchIdFrom(ctx);
  if (matchId === null) return reply({ error: "Partida inválida." }, 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Nota inválida." }, 400);
  }

  let match;
  try {
    match = await getMatchData(matchId);
  } catch (err) {
    if (err instanceof OpenDotaError) return reply({ error: "A OpenDota não respondeu. Tente de novo." }, 503);
    throw err;
  }
  if (!match) return reply({ error: "Partida não encontrada." }, 404);

  // Só quem jogou a partida anota (dados do herói e do resultado vêm daqui).
  const me = match.players.find((p) => p.account_id === session.accountId);
  if (!me) return reply({ error: "Você só pode anotar partidas em que jogou." }, 403);

  const [items, notes] = await Promise.all([getItems(), getMyNotes()]);
  const parsed = parseNoteInput(body, {
    itemIds: new Set(Object.keys(items).map(Number)),
    known: knownTags(notes),
  });
  if (!parsed.ok) return reply({ error: parsed.error }, 400);

  if (parsed.empty) {
    return (await deleteMyNote(matchId))
      ? reply({ note: null })
      : reply({ error: "Não foi possível salvar. Tente de novo." }, 500);
  }

  const saved = await saveMyNote(
    session.userId,
    session.accountId,
    {
      matchId,
      heroId: me.hero_id,
      won: match.radiant_win === null ? null : isWin(me.player_slot, match.radiant_win),
      playedAt: new Date(match.start_time * 1000).toISOString(),
    },
    parsed.note,
  );
  return saved ? reply({ note: saved }) : reply({ error: "Não foi possível salvar. Tente de novo." }, 500);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await getViewerSession();
  if (!session) return reply({ error: "Entre com a Steam para anotar." }, 401);
  const matchId = await matchIdFrom(ctx);
  if (matchId === null) return reply({ error: "Partida inválida." }, 400);
  return (await deleteMyNote(matchId))
    ? reply({ note: null })
    : reply({ error: "Não foi possível apagar. Tente de novo." }, 500);
}
