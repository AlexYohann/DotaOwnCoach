"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { ProSuggestionRow } from "@/components/pro-suggestion-row";
import {
  cleanQuery,
  submitTarget,
  type ProSearchResult,
  type ProSuggestion,
} from "@/lib/pros";
import { cn } from "@/lib/utils";

const WAIT_MS = 150;
const LABEL = "Nome do pro ou ID da Steam";

/** Sugestões já recebidas e para qual busca (normalizada) elas valem. */
type Loaded = { q: string; result: ProSearchResult; nowMs: number };

/**
 * Busca do cabeçalho (v2.1): nick de pro com sugestões, ou ID da Steam.
 * - Número + Enter → /player/<id>, como antes; quem valida é a página do jogador.
 * - Texto → sugestões de /pros/search (o servidor só é chamado quando a pessoa
 *   digita 2+ caracteres úteis; carregar a página não faz pedido nenhum).
 * `size="lg"` é a busca grande da página /pros.
 */
export function HeaderSearch({ size = "sm" }: { size?: "sm" | "lg" }) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);

  // Cancela o que estiver pendente (espera e pedido em andamento).
  function cancelPending() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    request.current?.abort();
    request.current = null;
  }
  useEffect(() => cancelPending, []);

  /** Pede as sugestões; null = falhou ou foi trocado por um pedido mais novo. */
  async function load(q: string): Promise<Loaded | null> {
    cancelPending();
    const controller = new AbortController();
    request.current = controller;
    try {
      const res = await fetch(`/pros/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      const result = (await res.json()) as ProSearchResult;
      if (controller.signal.aborted) return null; // resposta de pedido antigo
      const next = { q, result, nowMs: Date.now() };
      setLoaded(next);
      setActive(-1);
      return next;
    } catch {
      // Rede fora ou pedido cancelado: lista fechada, sem mensagem.
      if (!controller.signal.aborted) {
        setLoaded(null);
        setOpen(false);
      }
      return null;
    }
  }

  function handleChange(text: string) {
    setValue(text);
    cancelPending();
    const q = cleanQuery(text);
    if (q === null) {
      // Menos de 2 caracteres úteis: não chama o servidor e fecha a lista.
      setLoaded(null);
      setOpen(false);
      setActive(-1);
      return;
    }
    timer.current = setTimeout(async () => {
      if (await load(q)) setOpen(true);
    }, WAIT_MS);
  }

  const q = cleanQuery(value);
  // Só vale o que foi buscado para o texto que está no campo agora.
  const current = loaded && loaded.q === q ? loaded : null;
  const verified = current?.result.verified ?? [];
  const others = current?.result.others ?? [];
  const flat: ProSuggestion[] = [...verified, ...others];
  const onlyDigits = /^\d+$/.test(value.trim());
  // Número sem pro com esse nick: é busca por ID, não há o que avisar.
  const showEmpty = current !== null && flat.length === 0 && !onlyDigits;
  const expanded = open && (flat.length > 0 || showEmpty);

  function go(path: string) {
    cancelPending();
    // Limpa o campo: o Next guarda o estado da página de onde saímos, e ao
    // voltar para ela o texto antigo reaparecia na busca.
    setValue("");
    setLoaded(null);
    setOpen(false);
    setActive(-1);
    router.push(path);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let first = flat[0] ?? null;
    // Enter antes de as sugestões deste texto chegarem: busca agora.
    if (!current && q !== null && !onlyDigits && active < 0) {
      const fresh = await load(q);
      if (!fresh) return;
      first = fresh.result.verified[0] ?? fresh.result.others[0] ?? null;
      setOpen(true); // sem resultado → mostra "Nenhum pro"
    }
    const target = submitTarget(value, flat[active] ?? null, first);
    if (target) go(target);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (expanded) e.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (flat.length === 0) return;
    e.preventDefault();
    if (!expanded) {
      setOpen(true);
      return;
    }
    // Percorre os dois grupos em sequência e dá a volta.
    const step = e.key === "ArrowDown" ? 1 : -1;
    setActive((i) => (i < 0 && step < 0 ? flat.length - 1 : (i + step + flat.length) % flat.length));
  }

  const row = (pro: ProSuggestion, index: number) => (
    <ProSuggestionRow
      key={pro.accountId}
      id={`${listId}-${index}`}
      pro={pro}
      query={value}
      active={index === active}
      nowMs={current?.nowMs ?? 0}
      onSelect={() => go(`/player/${pro.accountId}`)}
      onHover={() => setActive(index)}
    />
  );
  const groupTitle =
    "border-t border-line px-2.5 pb-1 pt-2 text-[10px] font-normal uppercase tracking-widest text-muted-foreground first:border-t-0";

  return (
    <form
      role="search"
      aria-label="Buscar jogador"
      onSubmit={handleSubmit}
      className={cn(
        "relative w-full",
        size === "lg" ? "max-w-[560px]" : "sm:w-72",
      )}
    >
      <Search
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
          size === "lg" ? "left-4 h-4 w-4" : "left-2.5 h-3.5 w-3.5",
        )}
      />
      <input
        type="text"
        role="combobox"
        aria-label={LABEL}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={
          expanded && active >= 0 ? `${listId}-${active}` : undefined
        }
        placeholder={LABEL}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        maxLength={32}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "w-full min-w-0 rounded-md border text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ember",
          size === "lg"
            ? "h-[50px] border-ember bg-panel pl-11 pr-4 text-base"
            : "h-8 border-line bg-panel/80 pl-8 pr-2 text-xs",
        )}
      />
      <div
        id={listId}
        role="listbox"
        aria-label="Sugestões de pro players"
        hidden={!expanded}
        className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden whitespace-normal rounded-lg border border-line bg-panel shadow-[0_18px_40px_rgba(0,0,0,0.6)]"
      >
        {verified.length > 0 && (
          <div role="group" aria-label="Profissionais verificados">
            <div aria-hidden className={groupTitle}>
              Profissionais verificados
            </div>
            {verified.map((pro, i) => row(pro, i))}
          </div>
        )}
        {others.length > 0 && (
          <div
            role="group"
            aria-label="Outros jogadores com esse nome"
            className={cn(verified.length > 0 && "border-t border-line")}
          >
            <div aria-hidden className={cn(groupTitle, "border-t-0")}>
              Outros jogadores com esse nome
            </div>
            {others.map((pro, i) => row(pro, verified.length + i))}
          </div>
        )}
        {showEmpty && (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Nenhum pro com esse nome. Para outros jogadores, use o ID.
          </p>
        )}
        {flat.length > 0 && (
          <div
            aria-hidden
            className="hidden border-t border-line px-2.5 py-2 text-[11px] text-muted-foreground sm:block"
          >
            ↑ ↓ escolher · Enter abrir · número = busca por ID
          </div>
        )}
      </div>
    </form>
  );
}
