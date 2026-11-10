"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

/**
 * Busca do cabeçalho: código de amigo ou SteamID64 → /player/<id>.
 * Só navega; quem valida é a página do jogador (um lugar só).
 * v2.1: vai sugerir pro players por nome — por isso o input é separado do
 * envio, para pendurar uma lista de sugestões embaixo depois.
 */
export function HeaderSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = value.trim();
    if (!id) return;
    router.push(`/player/${encodeURIComponent(id)}`);
  }

  return (
    <form
      role="search"
      aria-label="Buscar jogador"
      onSubmit={handleSubmit}
      className="relative w-full sm:w-64"
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        inputMode="numeric"
        aria-label="Código de amigo ou SteamID64"
        placeholder="Código de amigo ou SteamID64"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-full min-w-0 rounded-md border border-line bg-panel/80 pl-8 pr-2 text-xs text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ember"
      />
    </form>
  );
}
