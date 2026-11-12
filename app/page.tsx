import Link from "next/link";
import { HeaderAccountSlot } from "@/components/header-account";
import { HomeHero } from "@/components/home-hero";
import { SiteHeader } from "@/components/site-header";
import { SteamIdForm } from "@/components/steam-id-form";

const GHOST =
  "rounded-md border border-line px-3.5 py-2 text-sm text-ink transition-colors hover:border-ember focus:outline-none focus-visible:ring-1 focus-visible:ring-ember";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col">
      <HomeHero
        nav={<SiteHeader account={<HeaderAccountSlot />} />}
      >
        <div className="flex flex-col gap-5 max-w-md">
          <h1 className="font-display text-5xl font-bold uppercase leading-[.95]">
            Suas partidas,
            <br />
            sem enrolação.
          </h1>
          <p className="text-muted-foreground">
            Cole seu código de amigo da Steam e veja suas últimas 20 partidas,
            herói por herói, item por item.
          </p>
          <SteamIdForm />
          {/* v2.1: caminhos para quem chegou sem ID. */}
          <div className="mt-2 border-t border-line pt-4">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Ainda sem o seu ID?
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2.5">
              {/* <a>, não <Link>: /pros/example sorteia e redireciona; com
                  prefetch o sorteio rodaria só de a capa aparecer. */}
              <a href="/pros/example" className={GHOST}>
                Ver um exemplo →
              </a>
              <Link href="/pros" className={GHOST}>
                Partidas dos <span className="font-semibold text-ember">pro players</span> →
              </Link>
            </div>
          </div>
        </div>
      </HomeHero>
    </main>
  );
}
