import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { refreshPros } from "@/lib/pros-data";

// A renovação faz ~8 chamadas à OpenDota com pausas e grava ~6.700 linhas.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

// Renovação diária da lista de pros (cron em vercel.json). A rota é pública
// no proxy porque o cron não tem sessão; quem protege é o CRON_SECRET, que a
// Vercel envia no cabeçalho Authorization.
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await refreshPros(), { headers: NO_STORE });
  } catch (err) {
    console.error("[pros] renovação diária falhou:", err);
    return NextResponse.json({ error: "refresh_failed" }, { status: 502, headers: NO_STORE });
  }
}
