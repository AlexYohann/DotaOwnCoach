import { Suspense } from "react";
import { PlayerFallback, PlayerFrame } from "@/components/player-frame";
import { PlayerPeers } from "@/components/player-peers";
import { getPeersSnapshot } from "@/lib/peers-data";

// Aba "Quem joga comigo" do perfil (v2.3; aba própria desde a v2.4). Só aqui
// a lista de parceiros é lida — e, se vencida, renovada pela própria seção.

export default function PlayerPeersPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="flex-1 flex flex-col">
      <Suspense fallback={<PlayerFallback />}>
        <PlayerFrame
          params={params}
          tab="parceiros"
          render={async ({ accountId, name, isOwner }) => {
            const peers = await getPeersSnapshot(accountId); // só lê o banco; nunca lança
            return (
              <PlayerPeers
                accountId={accountId}
                name={name}
                title={isOwner ? "Quem joga comigo" : undefined}
                // Primeira visita: o jogador ainda está sendo gravado; a seção pergunta.
                initial={peers.state === "unknown" ? { ...peers, state: "start" } : peers}
                nowMs={Date.now()}
              />
            );
          }}
        />
      </Suspense>
    </main>
  );
}
