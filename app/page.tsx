import { SteamIdForm } from "@/components/steam-id-form";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center p-8">
      <div className="w-full max-w-md flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Dota Own Coach</h1>
        <p className="text-sm text-muted-foreground">
          Digite seu Steam ID para ver suas últimas 20 partidas.
        </p>
        <SteamIdForm />
      </div>
    </main>
  );
}
