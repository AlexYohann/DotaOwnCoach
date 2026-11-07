import Link from "next/link";
import { Suspense } from "react";
import { HeroCell } from "@/components/hero-cell";
import {
  OpenDotaErrorMessage,
  StatusMessage,
} from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { getHeroes, getPlayerData, type PlayerData } from "@/lib/data";
import {
  formatDateTime,
  formatDuration,
  formatStartTime,
  isWin,
} from "@/lib/match";
import type { Hero } from "@/lib/opendota";
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
      <div className="w-full max-w-5xl flex flex-col gap-6">
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
      <StatusMessage title="ID inválido">
        <p>
          &quot;{rawId}&quot; não é um Steam ID válido. Use o Friend ID (ex.:
          123456789) ou o SteamID64 (17 dígitos, começa com 7656119…).
        </p>
      </StatusMessage>
    );
  }

  let player: PlayerData | null;
  let heroes: Record<number, Hero>;
  try {
    // Banco primeiro (10 min), OpenDota se vencido — ver lib/data.ts.
    // getHeroes nunca lança: se falhar, devolve {} e a tabela mostra o hero_id.
    [player, heroes] = await Promise.all([
      getPlayerData(accountId),
      getHeroes(),
    ]);
  } catch (err) {
    return <OpenDotaErrorMessage error={err} />;
  }

  if (!player) {
    return (
      <StatusMessage title="Jogador não encontrado">
        <p>
          A OpenDota não conhece a conta {accountId}. Confira o ID. Se estiver
          certo, o perfil pode estar privado.
        </p>
        <p>{PUBLIC_DATA_TIP}</p>
      </StatusMessage>
    );
  }

  const { profile, matches, freshness } = player;
  const name = profile.personaname ?? `Conta ${accountId}`;

  if (matches.length === 0) {
    return (
      <StatusMessage title={`${name}: nenhuma partida encontrada`}>
        <p>
          O jogador não tem partidas registradas ou o perfil está privado.
        </p>
        <p>{PUBLIC_DATA_TIP}</p>
      </StatusMessage>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{name}</h1>
      <p className="text-sm text-muted-foreground">
        Account ID {accountId} · últimas {matches.length} partidas · dados de{" "}
        {formatDateTime(freshness.fetchedAt)}
      </p>
      {freshness.source === "stale" && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          A OpenDota não respondeu agora. Mostrando os últimos dados salvos —
          partidas mais recentes podem estar faltando.
        </p>
      )}
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
            <th>
              <span className="sr-only">Detalhes</span>
            </th>
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
              <td className="text-right">
                <Button asChild variant="outline" size="sm">
                  {/* ?player= destaca e pré-seleciona este jogador na partida */}
                  <Link href={`/match/${m.match_id}?player=${accountId}`}>
                    Ver partida
                  </Link>
                </Button>
              </td>
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
