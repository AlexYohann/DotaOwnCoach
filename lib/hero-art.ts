// Arte oficial da Valve, só por link ao CDN da Steam (projeto de fã, v1.4).

const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2";

/** Ilustração Radiant × Dire usada como fundo dos cabeçalhos (fixa). */
export const ILLUSTRATION_URL = `${CDN}/images/dota_react/home/radiant_dire5.jpg`;

/**
 * Nome interno do herói ("night_stalker") a partir da URL da imagem que já
 * guardamos (.../heroes/<key>.png). null = herói desconhecido.
 */
export function heroKey(img: string | null | undefined): string | null {
  if (!img) return null;
  const m = /\/heroes\/([a-z0-9_]+)\.png(?:\?|$)/.exec(img);
  return m ? m[1] : null;
}

/** Animação oficial (webm com fundo transparente, 2–4 MB). */
export function heroRenderUrl(key: string): string {
  return `${CDN}/videos/dota_react/heroes/renders/${key}.webm`;
}

/** Imagem estática horizontal (256×144), usada como poster. */
export function heroImageUrl(key: string): string {
  return `${CDN}/images/dota_react/heroes/${key}.png`;
}

/** Heróis sorteados na home (animação conferida no CDN em 2026-11-08). */
export const HOME_HEROES: { key: string; name: string }[] = [
  { key: "juggernaut", name: "Juggernaut" },
  { key: "bloodseeker", name: "Bloodseeker" },
  { key: "bristleback", name: "Bristleback" },
  { key: "night_stalker", name: "Night Stalker" },
  { key: "lycan", name: "Lycan" },
  { key: "phoenix", name: "Phoenix" },
  { key: "templar_assassin", name: "Templar Assassin" },
  { key: "gyrocopter", name: "Gyrocopter" },
  { key: "storm_spirit", name: "Storm Spirit" },
  { key: "drow_ranger", name: "Drow Ranger" },
  { key: "windrunner", name: "Windranger" },
  { key: "slark", name: "Slark" },
];
