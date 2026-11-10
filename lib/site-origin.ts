// Origens em que o site aceita iniciar e concluir o login com a Steam.
// Não confiamos só no Host do request: se um proxy deixasse o cliente
// trocá-lo, uma resposta da Steam emitida para OUTRO site (outro return_to)
// passaria na checagem de origem. Puro: recebe o env para dar para testar.

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** A própria origem do request, se for confiável; senão null. */
export function trustedOrigin(requestOrigin: string, env: Env): string | null {
  let url: URL;
  try {
    url = new URL(requestOrigin);
  } catch {
    return null;
  }
  const origin = url.origin;

  if (env.VERCEL === "1") {
    // Variáveis de sistema da Vercel: produção, deploy atual e branch (preview).
    const allowed = [
      env.VERCEL_PROJECT_PRODUCTION_URL,
      env.VERCEL_URL,
      env.VERCEL_BRANCH_URL,
    ]
      .filter((host): host is string => !!host)
      .map((host) => `https://${host}`);
    return allowed.includes(origin) ? origin : null;
  }

  // Fora da Vercel (máquina do dev): só localhost em http.
  return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) ? origin : null;
}
