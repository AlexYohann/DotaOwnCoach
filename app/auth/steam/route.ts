import { NextResponse, type NextRequest } from "next/server";
import { trustedOrigin } from "@/lib/site-origin";
import {
  buildSteamLoginUrl,
  newLoginState,
  STEAM_STATE_COOKIE,
} from "@/lib/steam-openid";

// "Entrar com a Steam": manda para a página de login da própria Steam, com um
// state aleatório guardado num cookie deste navegador (o callback confere).
export function GET(request: NextRequest) {
  const origin = trustedOrigin(request.nextUrl.origin, process.env);
  if (!origin) {
    console.error(`[auth] origem não confiável: ${request.nextUrl.origin}`);
    return NextResponse.redirect(new URL("/auth/error?reason=steam", request.url));
  }

  const state = newLoginState();
  const response = NextResponse.redirect(buildSteamLoginUrl(origin, state));
  response.cookies.set(STEAM_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // volta da Steam é navegação GET de outro site: Lax envia
    secure: origin.startsWith("https:"),
    path: "/auth/steam",
    maxAge: 10 * 60,
  });
  return response;
}
