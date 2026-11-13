"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { HeaderAccount } from "@/lib/account";
import {
  HERO_MOTION_EVENT,
  readHeroMotion,
  saveHeroMotion,
  type HeroMotion,
} from "@/lib/hero-art";
import { steamProfileUrl } from "@/lib/steam";
import { createClient } from "@/lib/supabase/client";

// Com armazenamento bloqueado, até acessar window.localStorage lança.
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Avatar + nome no canto do cabeçalho, com o menu da conta. */
export function AccountMenu({ account }: { account: HeaderAccount }) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [motion, setMotion] = useState<HeroMotion>("playing");

  useEffect(() => {
    setMotion(readHeroMotion(browserStorage()));
    // O botão de pausa do banner também muda a preferência.
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<HeroMotion>).detail;
      if (next === "playing" || next === "paused") setMotion(next);
    };
    window.addEventListener(HERO_MOTION_EVENT, onChange);
    return () => {
      window.removeEventListener(HERO_MOTION_EVENT, onChange);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  // O código de amigo é o que os amigos digitam na Steam para adicionar.
  async function copyFriendCode() {
    try {
      await navigator.clipboard.writeText(String(account.accountId));
    } catch {
      return; // sem permissão ou API ausente: o número continua visível
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  function toggleMotion() {
    const next: HeroMotion = motion === "paused" ? "playing" : "paused";
    setMotion(next);
    saveHeroMotion(browserStorage(), next);
    window.dispatchEvent(new CustomEvent(HERO_MOTION_EVENT, { detail: next }));
  }

  // scope "local" (v2.1): sai só deste aparelho; o padrão ("global")
  // desconectava todos os outros navegadores da pessoa.
  // Navegação completa, não router.push: o cache do Next guardou páginas do
  // estado logado (inclusive o redirect "/" → /player/<id> pré-carregado pelo
  // link da marca), e o push("/") voltava para as partidas. Recarregar a
  // página descarta esse cache inteiro.
  async function logout() {
    await createClient().auth.signOut({ scope: "local" });
    window.location.assign("/");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Conta: ${account.name}`}
        className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel/80 py-1 pl-1 pr-1 sm:pr-3 text-xs text-ink hover:border-muted-foreground focus:outline-none focus:ring-1 focus:ring-ember"
      >
        <Avatar account={account} size={24} />
        <span className="hidden max-w-[10rem] truncate sm:inline">{account.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 border-line bg-panel">
        <DropdownMenuLabel className="flex items-center gap-3 font-normal">
          <Avatar account={account} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{account.name}</span>
            <span className="block text-[11px] text-muted-foreground">Conectado pela Steam</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-line" />
        {/* preventDefault: copiar não fecha o menu (dá para ver o "Copiado"). */}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void copyFriendCode();
          }}
          className="justify-between gap-3"
        >
          <span>
            <span className="block text-[11px] text-muted-foreground">Código de amigo</span>
            <span className="block tabular-nums text-ink">{account.accountId}</span>
          </span>
          <span aria-live="polite" className="text-[11px] text-muted-foreground">
            {copied ? "Copiado" : "Copiar"}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem asChild>
          <Link href={`/player/${account.accountId}`}>Minhas partidas</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={steamProfileUrl(account.accountId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Meu perfil na Steam ↗
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/pros">Pro players</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            toggleMotion();
          }}
          className="justify-between gap-3"
        >
          <span>Animação dos heróis</span>
          <span className="text-[11px] text-muted-foreground">
            {motion === "paused" ? "desligada" : "ligada"}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem onSelect={logout} className="text-loss focus:text-loss">
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({ account, size }: { account: HeaderAccount; size: number }) {
  const box = { width: size, height: size };
  if (account.avatar) {
    return (
      <Image
        src={account.avatar}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full"
        style={box}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-line font-semibold uppercase text-ink"
      style={{ ...box, fontSize: Math.round(size * 0.45) }}
    >
      {account.name.charAt(0)}
    </span>
  );
}
