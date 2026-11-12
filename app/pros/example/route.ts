import { NextResponse, type NextRequest } from "next/server";
import { getExampleAccountId } from "@/lib/pros-data";

// "Ver um exemplo" (capa): sorteia um profissional com partidas recentes e
// abre as partidas dele. Sem candidato, cai na página de pros.
// O destino é sempre um caminho nosso, montado aqui: nada vem de parâmetro.
// Com a lista vencida, getFeaturedTeams renova depois da resposta (~10–20 s).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const accountId = await getExampleAccountId();
  const url = request.nextUrl.clone();
  url.pathname = accountId === null ? "/pros" : `/player/${accountId}`;
  url.search = "";
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
