import { Suspense } from "react";
import { HeaderAccountSlot } from "@/components/header-account";
import { PageShell } from "@/components/page-shell";
import { StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";

type SearchParams = Promise<{ reason?: string | string[] }>;

const MESSAGES: Record<string, string> = {
  steam: "Não conseguimos confirmar seu login com a Steam. Tente entrar de novo.",
  session:
    "O login com a Steam deu certo, mas não conseguimos abrir sua sessão agora. Tente de novo em alguns minutos.",
};
const FALLBACK = "Algo deu errado no login. Tente entrar de novo.";

async function ErrorContent({ searchParams }: { searchParams: SearchParams }) {
  const { reason } = await searchParams;
  const key = Array.isArray(reason) ? reason[0] : reason;
  return <p>{(key && MESSAGES[key]) ?? FALLBACK}</p>;
}

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main className="flex-1 flex flex-col">
      <PageShell account={<HeaderAccountSlot />}>
        <StatusMessage title="Não foi possível entrar">
          {/* cacheComponents: searchParams só dentro de Suspense */}
          <Suspense fallback={<p>{FALLBACK}</p>}>
            <ErrorContent searchParams={searchParams} />
          </Suspense>
          {/* <a>, não <Link>: a rota redireciona para fora (Steam) */}
          <Button asChild className="mt-2 self-start">
            <a href="/auth/steam">Entrar com a Steam</a>
          </Button>
        </StatusMessage>
      </PageShell>
    </main>
  );
}
