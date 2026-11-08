"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Página da Steam que mostra o "Código de amigo" (= Friend ID, o que o site usa).
export const FRIEND_CODE_URL = "https://steamcommunity.com/my/friends/add";

// Só navega; a validação do ID acontece em /player/[id] (um único lugar).
export function SteamIdForm() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = value.trim();
    if (!id) return;
    router.push(`/player/${encodeURIComponent(id)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor="steam-id" className="sr-only">
        Código de amigo (ou SteamID64)
      </Label>
      <div className="flex gap-2">
        <Input
          id="steam-id"
          inputMode="numeric"
          placeholder="Código de amigo (ex.: 105248644)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 bg-panel border-line"
        />
        <Button type="submit" className="h-11 px-5">
          Buscar
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Não sabe o seu?{" "}
        <a
          href={FRIEND_CODE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink underline underline-offset-4"
        >
          Abrir meu código de amigo na Steam ↗
        </a>{" "}
        e copiar o número.
      </p>
    </form>
  );
}
