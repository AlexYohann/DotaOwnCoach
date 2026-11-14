"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// O que aparece no lugar da linha do tempo quando ela ainda não pode ser
// mostrada (v2.2): convite para entrar (deslogado) ou o pedido de
// processamento do replay, acompanhado até ficar pronto.

const POLL_MS = 8000;
const MAX_POLLS = 12;

const TEXT = {
  invite: "Linha do tempo: veja como o herói evoluiu minuto a minuto e quanto cada item acelerou o farm.",
  analyzing: "Analisando o replay desta partida… Costuma levar menos de um minuto. A linha do tempo aparece aqui sozinha.",
  slow: "A análise ainda não terminou. Volte daqui a pouco: quando ficar pronta, a linha do tempo aparece aqui.",
  tooOld: "Linha do tempo indisponível: o replay desta partida não existe mais.",
  limit: "Muitas análises pedidas hoje. Tente de novo amanhã.",
  busy: "Muitas análises pedidas agora. Recarregue a página daqui a um minuto.",
  failed: "Não foi possível analisar esta partida.",
} as const;

type View = "login" | "starting" | "analyzing" | "slow" | "tooOld" | "limit" | "busy" | "failed";

export function MatchTimelineGate({ matchId, state }: { matchId: number; state: "login" | "unparsed" }) {
  const router = useRouter();
  const [view, setView] = useState<View>(state === "login" ? "login" : "starting");

  useEffect(() => {
    if (state !== "unparsed") return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;
    const url = `/match/${matchId}/parse`;

    // null = erro de rede ou resposta estranha.
    async function call(method: "POST" | "GET"): Promise<string | null> {
      try {
        const res = await fetch(url, { method, signal: abort.signal, cache: "no-store" });
        if (res.status === 401) return "login"; // a sessão expirou com a página aberta
        const body = (await res.json()) as { status?: unknown };
        return typeof body.status === "string" ? body.status : null;
      } catch {
        return abort.signal.aborted ? "aborted" : null;
      }
    }

    function poll() {
      timer = setTimeout(async () => {
        polls += 1;
        const status = await call("GET");
        if (status === "aborted") return;
        if (status === "login") return setView("login");
        if (status === "ready") return router.refresh();
        if (status === "failed" || status === "unknown") return setView("failed");
        // pending ou erro de rede: tenta de novo, até o limite
        if (polls >= MAX_POLLS) return setView("slow");
        poll();
      }, POLL_MS);
    }

    (async () => {
      let status = await call("POST");
      // Partida aberta pela primeira vez: a página ainda pode estar gravando
      // a partida (after()). Uma segunda tentativa resolve.
      if (status === "unknown") {
        await new Promise((r) => {
          timer = setTimeout(r, 3000);
        });
        status = await call("POST");
      }
      if (status === "aborted") return;
      switch (status) {
        case "login":
          return setView("login");
        case "ready":
          return router.refresh();
        case "requested":
        case "pending":
          setView("analyzing");
          return poll();
        case "too_old":
          return setView("tooOld");
        case "limit":
          return setView("limit");
        case "busy": // teto por minuto (limite da OpenDota): nada foi gasto
          return setView("busy");
        default: // failed, unavailable, unknown, erro de rede
          return setView("failed");
      }
    })();

    return () => {
      abort.abort();
      if (timer) clearTimeout(timer);
    };
  }, [matchId, state, router]);

  if (view === "login") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel/80 px-3 py-2.5 text-sm">
        <p className="min-w-0 flex-1 text-muted-foreground">{TEXT.invite}</p>
        {/* <a>, não <Link>: a rota redireciona para a Steam, nada de prefetch */}
        <a
          href="/auth/steam"
          className="shrink-0 rounded-md bg-ember px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90"
        >
          Entrar com a Steam
        </a>
      </div>
    );
  }

  const message = view === "starting" ? null : view === "analyzing" ? TEXT.analyzing : TEXT[view];
  return (
    <p role="status" className="rounded-md border border-line bg-panel/80 px-3 py-2.5 text-sm text-muted-foreground">
      {message ?? " "}
    </p>
  );
}
