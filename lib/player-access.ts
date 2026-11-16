// Quem vê o quê no perfil (v2.4). Puro: testável e usável no cliente.

/** A aba Diário só existe na própria página de quem está logado. */
export function canSeeDiary(viewerId: number | null, accountId: number): boolean {
  return viewerId !== null && viewerId === accountId;
}

export type PlayerTab = "partidas" | "parceiros" | "diario";

/** Endereço de cada aba do perfil. */
export function tabHref(accountId: number, tab: PlayerTab): string {
  return tab === "partidas" ? `/player/${accountId}` : `/player/${accountId}/${tab}`;
}
