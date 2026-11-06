"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <Label htmlFor="steam-id">Steam ID (Friend ID ou SteamID64)</Label>
      <div className="flex gap-2">
        <Input
          id="steam-id"
          inputMode="numeric"
          placeholder="ex.: 123456789 ou 76561198..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit">Buscar</Button>
      </div>
    </form>
  );
}
