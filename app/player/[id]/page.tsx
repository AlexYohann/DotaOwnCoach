import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { formatDuration, formatStartTime, isWin } from "@/lib/match";
import {
  getHeroes,
  getPlayer,
  getRecentMatches,
  OpenDotaError,
  type Hero,
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
  let heroes: Record<number, Hero>;
  try {
    // getHeroes nunca lança: se falhar, devolve {} e a tabela mostra o hero_id.
    [profile, matches, heroes] = await Promise.all([
      getPlayer(accountId),
      getRecentMatches(accountId),
      getHeroes(),
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
            <th>Data</th>
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
              <td className="py-2">
                <HeroCell heroId={m.hero_id} hero={heroes[m.hero_id]} />
              </td>
              <td className="whitespace-nowrap">
                {formatStartTime(m.start_time)}
              </td>
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

function HeroCell({ heroId, hero }: { heroId: number; hero?: Hero }) {
  // Herói desconhecido (lista falhou ou herói novo ainda fora da lista).
  if (!hero) return <span>hero_id {heroId}</span>;
  return (
    <div className="flex items-center gap-2">
      <Image
        src={hero.img}
        alt={hero.name}
        width={64}
        height={36}
        className="rounded-sm"
      />
      <span>{hero.name}</span>
    </div>
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
