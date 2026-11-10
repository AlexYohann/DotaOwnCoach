import "server-only";

// Login com a Steam = OpenID 2.0 (o Supabase Auth não tem Steam entre os
// provedores). Este arquivo só decide se uma resposta da Steam é verdadeira;
// quem cria a sessão é lib/steam-session.ts.

export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
export const STEAM_CALLBACK_PATH = "/auth/steam/callback";

const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const TIMEOUT_MS = 8000;

/** Página de login da Steam, que devolve a pessoa para o nosso callback. */
export function buildSteamLoginUrl(origin: string): string {
  const p = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": origin + STEAM_CALLBACK_PATH,
    "openid.realm": origin,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_ENDPOINT}?${p}`;
}

/**
 * Confere a resposta que a Steam mandou para o callback. Devolve o SteamID64
 * só se TUDO bater e a própria Steam confirmar (check_authentication);
 * qualquer dúvida (formato, rede, timeout) = null. Nunca lança.
 * Replay: a Steam responde is_valid:false na 2ª confirmação da mesma
 * resposta (verificado em 2026-11-10), então não guardamos nonces.
 */
export async function verifySteamResponse(
  params: URLSearchParams,
  origin: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    if (params.get("openid.mode") !== "id_res") return null;
    if (params.get("openid.op_endpoint") !== STEAM_OPENID_ENDPOINT) return null;
    if (!isOurCallback(params.get("openid.return_to"), origin)) return null;

    const claimed = params.get("openid.claimed_id") ?? "";
    const match = CLAIMED_ID.exec(claimed);
    if (!match || params.get("openid.identity") !== claimed) return null;

    const body = new URLSearchParams();
    for (const [k, v] of params) if (k.startsWith("openid.")) body.set(k, v);
    body.set("openid.mode", "check_authentication");

    const res = await fetchFn(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      body: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const lines = (await res.text()).split("\n").map((l) => l.trim());
    return lines.includes("is_valid:true") ? match[1] : null;
  } catch {
    return null;
  }
}

// Mesma origem e mesmo caminho do nosso callback (query string não importa).
function isOurCallback(returnTo: string | null, origin: string): boolean {
  if (!returnTo) return false;
  try {
    const url = new URL(returnTo);
    return url.origin === origin && url.pathname === STEAM_CALLBACK_PATH;
  } catch {
    return false;
  }
}
