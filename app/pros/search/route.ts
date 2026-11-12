import { NextResponse, type NextRequest } from "next/server";
import { cleanQuery, type ProSearchResult } from "@/lib/pros";
import { searchPros } from "@/lib/pros-data";

const EMPTY: ProSearchResult = { verified: [], others: [] };
// A CDN guarda a resposta por 5 min: a mesma busca repetida não chega ao banco.
const CACHE = "public, s-maxage=300, stale-while-revalidate=600";

// Sugestões da busca por nick (v2.1). Só lê o banco; nunca chama a OpenDota.
export async function GET(request: NextRequest) {
  // Texto curto, longo demais ou só símbolos: responde vazio sem ir ao banco.
  const q = cleanQuery(request.nextUrl.searchParams.get("q"));
  const result = q === null ? EMPTY : await searchPros(q);
  return NextResponse.json(result, { headers: { "Cache-Control": CACHE } });
}
