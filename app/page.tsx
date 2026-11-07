import { SteamIdForm } from "@/components/steam-id-form";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center p-8">
      <div className="w-full max-w-md flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Dota Own Coach</h1>
        <p className="text-sm text-muted-foreground">
          Digite seu Steam ID para ver suas últimas 20 partidas.
        </p>
        <SteamIdForm />
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Não sabe seu Steam ID? Na página de conta da Steam ele aparece logo
            abaixo do seu nome (&quot;ID Steam: 7656119…&quot;).
          </p>
          <Button asChild variant="outline" className="self-start">
            <a
              href="https://store.steampowered.com/account/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver meu Steam ID na Steam ↗
            </a>
          </Button>
        </div>
      </div>
    </main>
  );
}
