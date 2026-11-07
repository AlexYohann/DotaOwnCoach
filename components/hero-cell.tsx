import Image from "next/image";

type HeroInfo = { name: string; img: string };

/** Imagem + nome do herói; cai no hero_id se o herói não for conhecido. */
export function HeroCell({
  heroId,
  hero,
}: {
  heroId: number;
  hero?: HeroInfo | null;
}) {
  // Herói desconhecido (lista falhou ou herói novo ainda fora da lista).
  if (!hero) return <span>hero_id {heroId}</span>;
  return (
    <span className="flex items-center gap-2">
      <Image
        src={hero.img}
        alt={hero.name}
        width={64}
        height={36}
        className="rounded-sm"
      />
      <span>{hero.name}</span>
    </span>
  );
}
