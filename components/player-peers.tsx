"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProAvatar } from "@/components/pro-suggestion-row";
import { formatDateTime } from "@/lib/match";
import { splitPeers, winPercent, type Peer, type PeersSnapshot } from "@/lib/peers";
import { agoLabel } from "@/lib/pros";

// "Quem joga com {nome}" (v2.3). A página entrega o que está guardado; se a
// lista está vencida ou falta, esta seção pede a renovação à rota
// /player/[id]/peers e pergunta de novo até ficar pronta (a OpenDota leva
// ~45 s). Mesmo ritmo do MatchTimelineGate.

const POLL_MS = 8000;
const MAX_POLLS = 12;
const UNKNOWN_RETRY_MS = 3000;
const MAX_UNKNOWN_RETRIES = 3;
// Visíveis de cara: o resto fica recolhido, para não empurrar a tabela de partidas.
const VISIBLE = 6;

type Problem = "slow" | "failed" | "unknown" | null;

const count = new Intl.NumberFormat("pt-BR");

export function PlayerPeers({
  accountId,
  name,
  initial,
  nowMs,
  title,
}: {
  accountId: number;
  name: string;
  title?: string; // padrão: "Quem joga com {nome}"
  initial: PeersSnapshot;
  nowMs: number;
}) {
  const [snap, setSnap] = useState(initial);
  const [now, setNow] = useState(nowMs);
  const [problem, setProblem] = useState<Problem>(initial.state === "failed" ? "failed" : null);

  useEffect(() => {
    if (initial.state === "ready" || initial.state === "failed") return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;
    let unknownRetries = 0;
    const wait = (ms: number, next: () => void) => {
      timer = setTimeout(next, ms);
    };

    async function ask() {
      let body: PeersSnapshot | null = null;
      try {
        const res = await fetch(`/player/${accountId}/peers`, { signal: abort.signal, cache: "no-store" });
        body = (await res.json()) as PeersSnapshot;
      } catch {
        if (abort.signal.aborted) return;
      }
      const state = body?.state;
      if (body && (state === "ready" || state === "failed" || state === "refreshing")) {
        // Lista nova (ou a mesma); null aqui não apaga a que já está na tela.
        setSnap((old) => ({ ...body, peers: body.peers ?? old.peers, fetchedAt: body.fetchedAt ?? old.fetchedAt }));
        setNow(Date.now());
      }
      if (state === "ready") return setProblem(null);
      if (state === "failed") return setProblem("failed");
      if (state === "unknown") {
        // Primeira visita: a página ainda pode estar gravando o jogador (after()).
        if (unknownRetries >= MAX_UNKNOWN_RETRIES) return setProblem("unknown");
        unknownRetries += 1;
        return wait(UNKNOWN_RETRY_MS, ask);
      }
      // refreshing ou erro de rede: pergunta de novo, até o limite.
      polls += 1;
      if (polls > MAX_POLLS) return setProblem("slow");
      wait(POLL_MS, ask);
    }

    ask();
    return () => {
      abort.abort();
      if (timer) clearTimeout(timer);
    };
  }, [accountId, initial.state]);

  const peers = snap.peers;
  const working = !problem && snap.state !== "ready";
  const { recent, old } = splitPeers(peers ?? [], now);

  let meta: string | null = null;
  if (working && peers) meta = "atualizando…";
  else if (snap.fetchedAt) meta = `dados de ${formatDateTime(new Date(snap.fetchedAt))}`;

  let message: string | null = null;
  if (problem === "failed") message = "A OpenDota não entregou a lista agora. Tente de novo mais tarde.";
  else if (problem === "unknown") message = "Ainda salvando este jogador. Recarregue a página daqui a pouco para ver os parceiros.";
  else if (problem === "slow") message = "A OpenDota está demorando para montar a lista. Volte daqui a pouco.";
  else if (working && !peers) message = `Buscando quem joga com ${name} na OpenDota… pode levar até um minuto.`;

  return (
    <section aria-labelledby="peers-title" className="w-full max-w-6xl mx-auto px-6 pb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="peers-title" className="font-display text-2xl font-bold uppercase leading-none">
          {title ?? `Quem joga com ${name}`}
        </h2>
        {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
      </div>

      {message && (
        <p role="status" className="mb-3 rounded-md border border-line bg-panel/80 px-3 py-2.5 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      {peers && peers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ninguém jogou 3 ou mais partidas no mesmo time que {name}.
        </p>
      )}
      {peers && peers.length > 0 && recent.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ninguém jogou com {name} nos últimos 90 dias.
        </p>
      )}

      {recent.length > 0 && <PeerGrid peers={recent.slice(0, VISIBLE)} nowMs={now} />}

      {recent.length > VISIBLE && (
        <details className="mt-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-ink hover:text-ember">
            Mais parceiros recentes ({recent.length - VISIBLE})
          </summary>
          <div className="mt-3">
            <PeerGrid peers={recent.slice(VISIBLE)} nowMs={now} />
          </div>
        </details>
      )}

      {old.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-ink hover:text-ember">
            Parceiros antigos ({old.length})
          </summary>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            Sem partidas em comum nos últimos 90 dias.
          </p>
          <PeerGrid peers={old} nowMs={now} />
        </details>
      )}
    </section>
  );
}

function PeerGrid({ peers, nowMs }: { peers: Peer[]; nowMs: number }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {peers.map((p) => (
        <PeerCard key={p.account_id} peer={p} nowMs={nowMs} />
      ))}
    </ul>
  );
}

function PeerCard({ peer: p, nowMs }: { peer: Peer; nowMs: number }) {
  const label = p.name ?? `Conta ${p.account_id}`;
  const pct = winPercent(p.with_win, p.with_games);
  const losses = Math.max(0, p.with_games - p.with_win);
  return (
    <li>
      <Link
        href={`/player/${p.account_id}`}
        prefetch={false}
        className="flex items-center gap-3 rounded-md border border-line bg-panel px-3 py-2.5 transition-colors hover:border-ember/60"
      >
        <ProAvatar src={p.avatar} name={label} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{label}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-ink">{count.format(p.with_games)}</span> juntos ·{" "}
            <span className="tabular-nums text-win">{count.format(p.with_win)}V</span>{" "}
            <span className="tabular-nums text-loss">{count.format(losses)}D</span>
            {pct !== null && <> · {pct}%</>}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {p.against_games > 0 && (
              <>
                {count.format(p.against_games)} contra ({count.format(p.against_win)}V) ·{" "}
              </>
            )}
            última vez {agoLabel(p.last_played * 1000, nowMs)}
          </p>
        </div>
      </Link>
    </li>
  );
}
