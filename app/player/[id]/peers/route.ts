import { after, NextResponse, type NextRequest } from "next/server";
import type { PeersSnapshot } from "@/lib/peers";
import { getPeersSnapshot, refreshPeers } from "@/lib/peers-data";
import { toAccountId } from "@/lib/steam";

// "Quem joga comigo" (v2.3). A seção da página do jogador pergunta aqui:
// devolve a lista guardada e o estado e, se ela pode ser renovada, renova
// DEPOIS da resposta (after): /players/{id}/peers da OpenDota leva ~45 s.
// A página em si nunca dispara isso — só o navegador, então robôs de busca
// não gastam chamadas.
export const maxDuration = 90; // getPeers espera até 60 s

type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const accountId = toAccountId(id);
  if (accountId === null) {
    const bad: PeersSnapshot = { state: "unknown", peers: null, fetchedAt: null };
    return NextResponse.json(bad, { status: 400, headers: NO_STORE });
  }

  const snap = await getPeersSnapshot(accountId);
  if (snap.state === "start") {
    after(() => refreshPeers(accountId));
    snap.state = "refreshing";
  }
  return NextResponse.json(snap, { headers: NO_STORE });
}
