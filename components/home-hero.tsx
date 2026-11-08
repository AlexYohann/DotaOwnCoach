"use client";

import { useEffect, useState } from "react";
import { HeroBanner } from "@/components/hero-banner";
import { HOME_HEROES, heroImageUrl } from "@/lib/hero-art";

/**
 * Capa da home com um herói sorteado a cada visita. O sorteio roda no
 * navegador (useEffect) para a home continuar estática (pré-renderizada).
 */
export function HomeHero({
  nav,
  children,
}: {
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  const [hero, setHero] = useState<(typeof HOME_HEROES)[number] | null>(null);

  useEffect(() => {
    setHero(HOME_HEROES[Math.floor(Math.random() * HOME_HEROES.length)]);
  }, []);

  return (
    <HeroBanner
      heroKey={hero?.key ?? null}
      poster={hero ? heroImageUrl(hero.key) : null}
      alt={hero?.name ?? ""}
      caption={hero?.name}
      illustration={false}
      tall
      nav={nav}
    >
      {children}
    </HeroBanner>
  );
}
