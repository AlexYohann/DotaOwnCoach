import { NextResponse, type NextRequest } from "next/server";
import { verifySteamResponse } from "@/lib/steam-openid";
import { prepareSteamSession } from "@/lib/steam-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// A Steam devolve a pessoa para cá. Ordem: confere a resposta com a Steam →
// garante o usuário (secret key) → abre a sessão nos cookies → partidas dela.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  // Cancelou na Steam: não é erro, só volta para a capa.
  if (params.get("openid.mode") === "cancel") return to("/");

  const steamId64 = await verifySteamResponse(params, request.nextUrl.origin);
  if (!steamId64) {
    console.error("[auth] resposta da Steam recusada");
    return to("/auth/error?reason=steam");
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("[auth] SUPABASE_SECRET_KEY ausente: login impossível");
    return to("/auth/error?reason=session");
  }

  try {
    const { accountId, tokenHash } = await prepareSteamSession(admin, steamId64);
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (error) throw new Error(`verifyOtp: ${error.code} ${error.message}`);
    return to(`/player/${accountId}`);
  } catch (err) {
    console.error("[auth] falha ao abrir a sessão:", err instanceof Error ? err.message : err);
    return to("/auth/error?reason=session");
  }
}
