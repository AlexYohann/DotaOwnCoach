// Dica da tela da partida (v2.1): aparece até a pessoa dispensar, e a escolha
// fica salva no navegador. Mesmo cuidado de lib/hero-art.ts: armazenamento
// bloqueado nunca derruba a tela.
const TIP_KEY = "dota-own-coach:match-tip";

/** true = a pessoa já dispensou a dica. */
export function readTipDismissed(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(TIP_KEY) === "dismissed";
  } catch {
    return false;
  }
}

/** Guarda a dispensa; se o navegador bloquear, vale só nesta visita. */
export function saveTipDismissed(storage: Pick<Storage, "setItem"> | null): void {
  try {
    storage?.setItem(TIP_KEY, "dismissed");
  } catch {
    // sem armazenamento
  }
}
