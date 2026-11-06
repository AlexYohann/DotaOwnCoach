import Link from "next/link";
import { Suspense } from "react";
import { formatDuration, isWin } from "@/lib/match";
import {
  getPlayer,
  getRecentMatches,
  OpenDotaError,
  type PlayerProfile,
  type RecentMatch,
} from "@/lib/opendota";
import { toAccountId } from "@/lib/steam";

const PUBLIC_DATA_TIP =
  'No Dota 2: Configurações → Opções → Social → ative "Expor dados públicos de partidas". Depois disso, pode levar um tempo até a OpenDota ver suas partidas novas.';

export default function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center p-8">
      <div className="w-full max-w-4xl flex flex-col gap-6">
        <Link href="/" className="text-sm underline">
          ← Nova busca
        </Link>
        {/* cacheComponents: dados de request (params, fetch) ficam dentro de Suspense */}
        <Suspense fallback={<p>Buscando partidas na OpenDota…</p>}>
          <PlayerContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function PlayerContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rawId = safeDecode(id);
  const accountId = toAccountId(rawId);

  if (accountId === null) {
    return (
      <Message title="ID inválido">
        <p>
          &quot;{rawId}&quot; não é um Steam ID válido. Use o Friend ID (ex.:
          123456789) ou o SteamID64 (17 dígitos, começa com 7656119…).
        </p>
      </Message>
    );
  }

  let profile: PlayerProfile | null;
  let matches: RecentMatch[];
  try {
    [profile, matches] = await Promise.all([
      getPlayer(accountId),
      getRecentMatches(accountId),
    ]);
  } catch (err) {
    if (err instanceof OpenDotaError && err.kind === "rate_limit") {
      return (
        <Message title="Limite de requisições atingido">
          <p>
            A OpenDota limitou as requisições (plano gratuito). Tente de novo
            em alguns minutos.
          </p>
        </Message>
      );
    }
    console.error(err);
    return (
      <Message title="OpenDota indisponível">
        <p>
          A OpenDota está fora do ar ou não respondeu a tempo. Tente de novo
          mais tarde.
        </p>
      </Message>
    );
  }

  if (!profile) {
    return (
      <Message title="Jogador não encontrado">
        <p>
          A OpenDota não conhece a conta {accountId}. Confira o ID. Se estiver
          certo, o perfil pode estar privado.
        </p>
        <p>{PUBLIC_DATA_TIP}</p>
      </Message>
    );
  }

  const name = profile.personaname ?? `Conta ${accountId}`;

  if (matches.length === 0) {
    return (
      <Message title={`${name}: nenhuma partida encontrada`}>
        <p>
          O jogador não tem partidas registradas ou o perfil está privado.
        </p>
        <p>{PUBLIC_DATA_TIP}</p>
      </Message>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{name}</h1>
      <p className="text-sm text-muted-foreground">
        Account ID {accountId} · últimas {matches.length} partidas
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Herói</th>
            <th>Resultado</th>
            <th>K/D/A</th>
            <th>Duração</th>
            <th>GPM/XPM</th>
            <th>LH</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.match_id} className="border-b">
              <td className="py-2">hero_id {m.hero_id}</td>
              <td>
                {m.radiant_win === null
                  ? "—"
                  : isWin(m.player_slot, m.radiant_win)
                    ? "Vitória"
                    : "Derrota"}
              </td>
              <td>
                {m.kills}/{m.deaths}/{m.assists}
              </td>
              <td>{formatDuration(m.duration)}</td>
              <td>
                {m.gold_per_min}/{m.xp_per_min}
              </td>
              <td>{m.last_hits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// decodeURIComponent lança URIError com "%" solto (ex.: "/player/100%").
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function Message({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </section>
  );
}
