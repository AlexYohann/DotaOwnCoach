import "server-only";
import { getPlayer, requestPlayerRefresh } from "@/lib/opendota";
import { createAdminClient } from "@/lib/supabase/admin";

// Nome e avatar de quem está logado (v2.1).
//
// A OpenDota guarda uma cópia do perfil da Steam e só a renova de vez em
// quando: quem troca de nome na Steam continuava com o nome antigo no site
// por dias. Ela oferece um pedido de renovação; fazemos esse pedido só para a
// PRÓPRIA conta de quem está logado, no máximo uma vez por dia — cada pedido
// faz a OpenDota reprocessar o histórico da conta, e o plano gratuito tem limite.

const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;
const WAIT_MS = 6000; // a OpenDota leva ~5 s para refletir a renovação (medido)

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const logDb = (what: string, error: { code?: string; message?: string }) =>
  console.error(`[db] ${what}: ${error.code ?? ""} ${error.message ?? ""}`);

/**
 * Chame dentro de after(): a página nunca espera por isto. Nunca lança.
 * - "skipped": já renovou nas últimas 24 h, conta sem linha em profiles ou sem secret key;
 * - "done": nome e avatar novos gravados em players;
 * - "failed": a OpenDota recusou ou não conhece o perfil (tenta de novo amanhã).
 */
export async function refreshOwnProfile(
  accountId: number,
  wait: (ms: number) => Promise<void> = pause,
): Promise<"skipped" | "done" | "failed"> {
  const admin = createAdminClient();
  if (!admin) return "skipped";

  // "Reserva": UPDATE condicional, então duas abas abertas juntas não pedem duas vezes.
  const now = Date.now();
  const cutoff = new Date(now - REFRESH_EVERY_MS).toISOString();
  const { data, error } = await admin
    .from("profiles")
    .update({ profile_refreshed_at: new Date(now).toISOString() })
    .eq("account_id", accountId)
    .or(`profile_refreshed_at.is.null,profile_refreshed_at.lt.${cutoff}`)
    .select("id");
  if (error) {
    logDb("reservar renovação do perfil", error);
    return "skipped";
  }
  if (!Array.isArray(data) || data.length === 0) return "skipped";

  try {
    await requestPlayerRefresh(accountId);
    await wait(WAIT_MS);
    const profile = await getPlayer(accountId);
    if (!profile) return "failed";

    // Só nome/avatar/link. fetched_at fica como está: ele controla o cache de
    // 10 min das partidas (lib/data.ts) e não é assunto daqui.
    const { error: e2 } = await admin
      .from("players")
      .update({
        personaname: profile.personaname,
        avatar: profile.avatarmedium,
        profile_url: profile.profileurl,
      })
      .eq("account_id", accountId);
    if (e2) {
      logDb("gravar nome/avatar em players", e2);
      return "failed";
    }
    return "done";
  } catch (err) {
    console.error("[perfil] renovação na OpenDota falhou:", err);
    return "failed";
  }
}
