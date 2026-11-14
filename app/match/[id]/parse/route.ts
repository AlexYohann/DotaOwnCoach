import { NextResponse, type NextRequest } from "next/server";
import { getViewerAccountId } from "@/lib/account";
import { checkMatchParse, requestMatchParse } from "@/lib/match-parse";

// Processamento do replay para a linha do tempo (v2.2). Só para quem está
// logado (decisão do Alex): sem sessão, 401 antes de qualquer outra coisa.
//   POST → pede (se as guardas de lib/match-parse.ts deixarem)
//   GET  → acompanha um pedido em andamento
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status: string, code = 200) =>
  NextResponse.json({ status }, { status: code, headers: NO_STORE });

/** ID válido e quem está vendo; ou a resposta de erro pronta. */
async function guard(ctx: Ctx): Promise<number | NextResponse> {
  if ((await getViewerAccountId()) === null) return reply("login", 401);
  const { id } = await ctx.params;
  if (!/^\d{1,20}$/.test(id)) return reply("unknown", 400);
  return Number(id);
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const matchId = await guard(ctx);
  if (typeof matchId !== "number") return matchId;
  return reply(await requestMatchParse(matchId));
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const matchId = await guard(ctx);
  if (typeof matchId !== "number") return matchId;
  return reply(await checkMatchParse(matchId));
}
