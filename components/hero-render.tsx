"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { heroRenderUrl } from "@/lib/hero-art";

type Mode = "pending" | "video" | "poster";

/**
 * Animação oficial do herói. Nunca atrasa a página: o primeiro render não tem
 * vídeo; ele entra com fade quando consegue tocar.
 * - paused (botão do HeroBanner) → vídeo parado no quadro atual
 * - economia de dados, herói sem animação (404) ou herói desconhecido → imagem estática
 * Sempre anima por padrão, mesmo com "reduzir movimento" no sistema (decisão
 * do Alex, 2026-11-08); quem quiser parar usa o botão de pausar.
 */
export function HeroRender({
  heroKey,
  poster,
  alt,
  paused,
}: {
  heroKey: string | null;
  poster: string | null;
  alt: string;
  paused: boolean;
}) {
  const [mode, setMode] = useState<Mode>("pending");
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setReady(false);
    if (!heroKey) return setMode("poster");
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    setMode(conn?.saveData ? "poster" : "video");
  }, [heroKey]);

  // Pausar/retomar sem recriar o vídeo (mantém o quadro atual).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {}); // autoplay bloqueado: fica no 1º quadro
  }, [paused, mode, heroKey]);

  if (mode === "pending") return null;

  if (mode === "poster") {
    return poster ? (
      <div className="flex h-full items-end justify-center pb-10">
        <Image
          src={poster}
          alt={alt}
          width={256}
          height={144}
          className="rounded-md opacity-80"
        />
      </div>
    ) : null;
  }

  return (
    <video
      ref={videoRef}
      key={heroKey}
      src={heroRenderUrl(heroKey!)}
      aria-label={alt}
      muted
      loop
      playsInline
      autoPlay={!paused}
      preload="auto"
      onLoadedData={() => setReady(true)}
      onError={() => setMode("poster")}
      className={`h-full w-auto transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
    />
  );
}
