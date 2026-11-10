import { NextResponse, type NextRequest } from "next/server";
import { buildSteamLoginUrl } from "@/lib/steam-openid";

// "Entrar com a Steam": manda para a página de login da própria Steam.
export function GET(request: NextRequest) {
  return NextResponse.redirect(buildSteamLoginUrl(request.nextUrl.origin));
}
