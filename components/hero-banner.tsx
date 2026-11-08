import { HeroRender } from "@/components/hero-render";
import { ILLUSTRATION_URL } from "@/lib/hero-art";

// A animação fica presa no bloco e apaga na base: nunca invade o que vem abaixo.
const FADE_BOTTOM = "linear-gradient(180deg,#000 62%,transparent 92%)";

/**
 * Cabeçalho das telas: ilustração Radiant × Dire escurecida ao fundo, herói
 * animado à direita e o conteúdo (children) à esquerda, sem sobreposição.
 * No celular o herói vai para trás do texto, apagado.
 */
export function HeroBanner({
  heroKey,
  poster,
  alt,
  caption,
  illustration = true,
  children,
}: {
  heroKey: string | null;
  poster: string | null;
  alt: string;
  caption?: string; // ex.: nome do herói sorteado na home
  illustration?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden min-h-[420px] pb-8">
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
      {/* herói e texto no mesmo contêiner central: sem vão em tela larga */}
      <div className="relative isolate w-full max-w-6xl mx-auto px-6 min-h-[380px]">
        <div
          className="absolute right-0 top-0 h-[380px] -z-10 opacity-30 md:opacity-100"
          style={{ maskImage: FADE_BOTTOM, WebkitMaskImage: FADE_BOTTOM }}
        >
          <HeroRender heroKey={heroKey} poster={poster} alt={alt} />
        </div>
        <div className="md:max-w-[58%]">{children}</div>
        {caption && (
          <span className="absolute right-6 -bottom-5 text-xs text-muted-foreground">
            {caption}
          </span>
        )}
      </div>
    </section>
  );
}
