"use client";

import { useEffect, useState } from "react";
import { readTipDismissed, saveTipDismissed } from "@/lib/match-tip";

// Navegador com armazenamento bloqueado lança só de tocar em localStorage.
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Dica da tela da partida (v2.1): quem chega pelo "Ver um exemplo" não sabe
 * que os heróis são clicáveis. Começa oculta (o servidor não conhece a
 * escolha salva) e some de vez quando a pessoa dispensa.
 */
export function MatchTip() {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(!readTipDismissed(browserStorage())), []);

  if (!visible) return null;
  return (
    <div
      role="note"
      className="mb-4 flex items-start gap-3 rounded-md border border-line bg-panel px-3 py-2 text-xs text-muted-foreground"
    >
      <p className="flex-1">
        Clique num herói para ver os detalhes. Passe o mouse num item para ver
        o que ele faz.
      </p>
      <button
        type="button"
        aria-label="Dispensar dica"
        onClick={() => {
          saveTipDismissed(browserStorage());
          setVisible(false);
        }}
        className="-my-1 shrink-0 rounded px-1.5 py-1 text-base leading-none transition-colors hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ember"
      >
        ×
      </button>
    </div>
  );
}
