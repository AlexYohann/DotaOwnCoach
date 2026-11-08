"use client";

import { useEffect, useState } from "react";
import { HeroRender } from "@/components/hero-render";
import {
  ILLUSTRATION_URL,
  readHeroMotion,
  saveHeroMotion,
  type HeroMotion,
} from "@/lib/hero-art";

// Com armazenamento bloqueado, até acessar window.localStorage lança.
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// A animação fica presa no bloco e apaga na base: nunca invade o que vem abaixo.
const FADE_BOTTOM = "linear-gradient(180deg,#000 62%,transparent 92%)";

/**
 * Cabeçalho das telas: ilustração Radiant × Dire escurecida ao fundo, herói
 * animado à direita e o conteúdo (children) à esquerda, sem sobreposição.
 * No celular o herói vai para trás do texto, apagado.
 * Botão de pausar/animar (WCAG 2.2.2), lembrado no navegador.
 */
export function HeroBanner({
  heroKey,
  poster,
  alt,
  caption,
  illustration = true,
  tall = false,
  nav,
  children,
}: {
  nav?: React.ReactNode; // barra do topo (SiteHeader), largura total
  tall?: boolean; // capa da home: ocupa a altura da tela
  heroKey: string | null;
  poster: string | null;
  alt: string;
  caption?: string; // ex.: nome do herói sorteado na home
  illustration?: boolean;
  children: React.ReactNode;
}) {
  const [motion, setMotion] = useState<HeroMotion>("playing");
  useEffect(() => setMotion(readHeroMotion(browserStorage())), []);

  function toggleMotion() {
    const next: HeroMotion = motion === "paused" ? "playing" : "paused";
    setMotion(next);
    saveHeroMotion(browserStorage(), next);
  }

  return (
    <section
      className={`relative isolate overflow-hidden pb-8 ${tall ? "flex-1 flex flex-col" : "min-h-[420px]"}`}
    >
      {illustration && (
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-cover bg-center"
          style={{
            backgroundImage: `url(${ILLUSTRATION_URL})`,
            filter: "brightness(.28) saturate(.9)",
          }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-20"
        style={{ background: "linear-gradient(0deg,#0b0d10 0%,rgba(11,13,16,0) 40%)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 hidden md:block"
        style={{
          background:
            "linear-gradient(90deg,rgba(11,13,16,.9) 0%,rgba(11,13,16,.45) 40%,rgba(11,13,16,0) 60%)",
        }}
      />
      {nav && <div className="w-full max-w-6xl mx-auto px-6 py-4">{nav}</div>}
      {/* herói e texto no mesmo contêiner central: sem vão em tela larga */}
      <div
        className={`relative isolate w-full max-w-6xl mx-auto px-6 ${tall ? "flex-1 flex items-center min-h-[520px]" : "min-h-[380px]"}`}
      >
        <div
          className={`absolute right-0 -z-10 opacity-30 md:opacity-100 ${tall ? "top-1/2 -translate-y-1/2 h-[min(560px,75vh)]" : "top-0 h-[380px]"}`}
          style={{ maskImage: FADE_BOTTOM, WebkitMaskImage: FADE_BOTTOM }}
        >
          <HeroRender
            heroKey={heroKey}
            poster={poster}
            alt={alt}
            paused={motion === "paused"}
          />
        </div>
        <div className="md:max-w-[58%]">{children}</div>
      </div>
      {/* acima de tudo (z-10): no celular o conteúdo cobre a área do herói */}
      <div className="absolute bottom-2 right-0 left-0 z-10">
        <div className="max-w-6xl mx-auto px-6 flex justify-end items-center gap-3 text-xs text-muted-foreground">
          {caption && <span>{caption}</span>}
          {heroKey && (
            <button
              type="button"
              onClick={toggleMotion}
              aria-pressed={motion === "paused"}
              className="rounded border border-line bg-background/60 px-2 py-0.5 hover:text-ink"
            >
              {motion === "paused" ? "▶ Animar" : "⏸ Pausar animação"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
