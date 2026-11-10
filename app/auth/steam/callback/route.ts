import { NextResponse, type NextRequest } from "next/server";
import { trustedOrigin } from "@/lib/site-origin";
import { STEAM_STATE_COOKIE, verifySteamResponse } from "@/lib/steam-openid";
import { prepareSteamSession } from "@/lib/steam-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// A Steam devolve a pessoa para cá. Ordem: origem confiável → confere a
// resposta com a Steam (e o state do cookie) → garante o usuário (secret key)
// → abre a sessão nos cookies → partidas dela.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const to = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin ?? request.url));
    // O state vale uma vez só, deu certo ou não.
    response.cookies.set(STEAM_STATE_COOKIE, "", { path: "/auth/steam", maxAge: 0 });
    return response;
  };

  const origin = trustedOrigin(request.nextUrl.origin, process.env);
  if (!origin) {
    console.error(`[auth] origem não confiável: ${request.nextUrl.origin}`);
    return to("/auth/error?reason=steam");
  }

  // Cancelou na Steam: não é erro, só volta para a capa.
  if (params.get("openid.mode") === "cancel") return to("/");

  const expectedState = request.cookies.get(STEAM_STATE_COOKIE)?.value ?? "";
  const steamId64 = await verifySteamResponse(params, origin, expectedState);
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
