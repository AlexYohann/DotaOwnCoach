import { SiteHeader } from "@/components/site-header";

/** Página simples (carregando, erros, ID inválido): barra do topo + conteúdo. */
export function PageShell({
  right,
  children,
}: {
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-4 flex flex-col gap-10">
      <SiteHeader right={right} />
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}
