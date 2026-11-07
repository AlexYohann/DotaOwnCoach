import { OpenDotaError } from "@/lib/opendota";

// Só para Server Components: importa lib/opendota (server-only).

export function StatusMessage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </section>
  );
}

/** Mensagem para erro vindo da OpenDota (limite de requisições ou fora do ar). */
export function OpenDotaErrorMessage({ error }: { error: unknown }) {
  if (error instanceof OpenDotaError && error.kind === "rate_limit") {
    return (
      <StatusMessage title="Limite de requisições atingido">
        <p>
          A OpenDota limitou as requisições (plano gratuito). Tente de novo em
          alguns minutos.
        </p>
      </StatusMessage>
    );
  }
  console.error(error);
  return (
    <StatusMessage title="OpenDota indisponível">
      <p>
        A OpenDota está fora do ar ou não respondeu a tempo. Tente de novo mais
        tarde.
      </p>
    </StatusMessage>
  );
}
