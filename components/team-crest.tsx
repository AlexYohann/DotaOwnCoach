"use client";

import { useEffect, useRef, useState } from "react";
import { safeLogoUrl } from "@/lib/pros";

/**
 * Brasão do time. Sem brasão (ou http://, ou imagem que não carrega) mostra a
 * sigla num selo de texto; sem os dois, nada — nunca um ícone quebrado.
 */
export function TeamCrest({
  logo,
  tag,
  size,
}: {
  logo: string | null;
  tag: string | null;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = safeLogoUrl(logo);
  // Em /pros a imagem vem no HTML do servidor: se ela falhar antes de o React
  // assumir a página, o onError já passou. Confere uma vez ao montar.
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setFailed(true);
  }, []);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={img}
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  const text = tag?.trim();
  if (!text) return null;
  return (
    <span className="max-w-[5.5rem] shrink-0 truncate rounded border border-line px-1.5 py-px font-display text-[13px] uppercase tracking-wide text-muted-foreground">
      {text}
    </span>
  );
}
