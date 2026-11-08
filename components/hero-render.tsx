"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { heroRenderUrl } from "@/lib/hero-art";

type Mode = "pending" | "video" | "still" | "poster";

/**
 * Animação oficial do herói. Nunca atrasa a página: o primeiro render não tem
 * vídeo; ele entra com fade quando consegue tocar.
 * - prefers-reduced-motion → vídeo parado (primeiro quadro)
 * - economia de dados, herói sem animação (404) ou herói desconhecido → imagem estática
 */
export function HeroRender({
  heroKey,
  poster,
  alt,
}: {
  heroKey: string | null;
  poster: string | null;
  alt: string;
}) {
  const [mode, setMode] = useState<Mode>("pending");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!heroKey) return setMode("poster");
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (conn?.saveData) return setMode("poster");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMode(reduce ? "still" : "video");
  }, [heroKey]);

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
      key={heroKey}
      src={heroRenderUrl(heroKey!)}
      aria-label={alt}
      muted
      loop
      playsInline
      autoPlay={mode === "video"}
      preload={mode === "video" ? "auto" : "metadata"}
      onLoadedData={() => setReady(true)}
      onError={() => setMode("poster")}
      className={`h-full w-auto transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
    />
  );
}
