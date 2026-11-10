import { HeaderAccountSlot } from "@/components/header-account";
import { HomeHero } from "@/components/home-hero";
import { SiteHeader } from "@/components/site-header";
import { SteamIdForm } from "@/components/steam-id-form";

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
        </div>
      </HomeHero>
    </main>
  );
}
