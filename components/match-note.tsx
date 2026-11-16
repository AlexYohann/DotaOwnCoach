"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Lock, Plus, X } from "lucide-react";
import {
  canonicalTag,
  DEFAULT_TAGS,
  NOTE_LIMITS,
  normalizeTag,
  tagKey,
  type MissingItem,
  type Note,
} from "@/lib/diary";
import { cn } from "@/lib/utils";

// Diário (v2.4): a nota de quem jogou a partida, na tela da partida. Dois
// lados (deu certo / deu errado) com etiquetas e texto, e os itens que
// faltaram com o motivo. Só aparece para quem jogou; o conteúdo só é lido e
// gravado com a sessão da pessoa (RLS).

export type PickerItem = { id: number; name: string; img: string | null };

type Side = "good" | "bad";
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function MatchNote({
  matchId,
  initial,
  knownTags,
  items,
}: {
  matchId: number;
  initial: Note | null;
  knownTags: string[];
  items: PickerItem[];
}) {
  const [saved, setSaved] = useState<Note | null>(initial);
  const [open, setOpen] = useState(initial !== null);
  const [good, setGood] = useState<string[]>(initial?.goodTags ?? []);
  const [bad, setBad] = useState<string[]>(initial?.badTags ?? []);
  const [goodText, setGoodText] = useState(initial?.goodText ?? "");
  const [badText, setBadText] = useState(initial?.badText ?? "");
  const [missing, setMissing] = useState<MissingItem[]>(initial?.missingItems ?? []);
  const [extraTags, setExtraTags] = useState<string[]>([]); // criadas agora, antes de salvar
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  // "+ anotar" da tabela de partidas chega com #nota: abre e rola até aqui.
  useEffect(() => {
    if (window.location.hash === "#nota") {
      setOpen(true);
      requestAnimationFrame(() => document.getElementById("nota")?.scrollIntoView({ block: "start" }));
    }
  }, []);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Opções: fixas, depois as próprias já usadas, depois as criadas agora.
  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...DEFAULT_TAGS, ...knownTags, ...good, ...bad, ...extraTags]) {
      const k = tagKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  }, [knownTags, good, bad, extraTags]);

  const dirty =
    JSON.stringify([good, bad, goodText.trim(), badText.trim(), missing]) !==
    JSON.stringify([
      saved?.goodTags ?? [],
      saved?.badTags ?? [],
      saved?.goodText ?? "",
      saved?.badText ?? "",
      saved?.missingItems ?? [],
    ]);

  function toggle(side: Side, tag: string) {
    const key = tagKey(tag);
    const [mine, setMine, setOther] = side === "good" ? [good, setGood, setBad] : [bad, setBad, setGood];
    if (mine.some((t) => tagKey(t) === key)) {
      setMine(mine.filter((t) => tagKey(t) !== key));
    } else {
      if (mine.length >= NOTE_LIMITS.tags) return;
      setMine([...mine, tag]);
      // a mesma etiqueta não fica nos dois lados
      setOther((other) => other.filter((t) => tagKey(t) !== key));
    }
    setStatus({ kind: "idle" });
  }

  function addTag(side: Side, raw: string): boolean {
    const tag = normalizeTag(raw);
    if (!tag) return false;
    const canon = canonicalTag(tag, [...knownTags, ...extraTags]);
    if (!options.some((t) => tagKey(t) === tagKey(canon))) setExtraTags((x) => [...x, canon]);
    const mine = side === "good" ? good : bad;
    if (!mine.some((t) => tagKey(t) === tagKey(canon))) toggle(side, canon);
    return true;
  }

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch(`/match/${matchId}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goodTags: good, badTags: bad, goodText, badText, missingItems: missing }),
      });
      const body = (await res.json().catch(() => ({}))) as { note?: Note | null; error?: string };
      if (!res.ok) {
        return setStatus({ kind: "error", message: body.error ?? "Não foi possível salvar. Tente de novo." });
      }
      applySaved(body.note ?? null);
      setStatus({ kind: "saved" });
    } catch {
      setStatus({ kind: "error", message: "Sem conexão. Tente de novo." });
    }
  }

  async function remove() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch(`/match/${matchId}/note`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      applySaved(null);
      setConfirmDelete(false);
      setOpen(false);
      setStatus({ kind: "idle" });
    } catch {
      setStatus({ kind: "error", message: "Não foi possível apagar. Tente de novo." });
    }
  }

  function applySaved(note: Note | null) {
    setSaved(note);
    setGood(note?.goodTags ?? []);
    setBad(note?.badTags ?? []);
    setGoodText(note?.goodText ?? "");
    setBadText(note?.badText ?? "");
    setMissing(note?.missingItems ?? []);
  }

  if (!open) {
    return (
      <section id="nota" className="mt-6 scroll-mt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-line bg-panel/80 px-3 py-2 text-sm font-semibold text-ink hover:border-ember/60"
        >
          Anotar esta partida
        </button>
      </section>
    );
  }

  return (
    <section id="nota" aria-labelledby="nota-title" className="mt-6 scroll-mt-4 rounded-md border border-line bg-panel/60 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="nota-title" className="font-display text-2xl font-bold uppercase leading-none">
          Sua nota
        </h2>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
          Só você vê
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SideEditor
          side="good"
          title="Deu certo"
          options={options}
          selected={good}
          text={goodText}
          onToggle={(t) => toggle("good", t)}
          onAdd={(t) => addTag("good", t)}
          onText={(t) => {
            setGoodText(t);
            setStatus({ kind: "idle" });
          }}
        />
        <SideEditor
          side="bad"
          title="Deu errado"
          options={options}
          selected={bad}
          text={badText}
          onToggle={(t) => toggle("bad", t)}
          onAdd={(t) => addTag("bad", t)}
          onText={(t) => {
            setBadText(t);
            setStatus({ kind: "idle" });
          }}
        />
      </div>

      <div className="mt-3 rounded-md border border-line bg-panel p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">Itens que faltaram</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {missing.map((m, i) => {
            const it = itemById.get(m.itemId);
            return (
              <li key={m.itemId} className="flex items-start gap-2">
                {it?.img ? (
                  <Image src={it.img} alt="" width={44} height={32} className="mt-0.5 shrink-0 rounded-sm" />
                ) : (
                  <span className="mt-0.5 h-8 w-11 shrink-0 rounded-sm bg-line" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{it?.name ?? `Item #${m.itemId}`}</p>
                  <input
                    value={m.reason}
                    maxLength={NOTE_LIMITS.reason}
                    placeholder="Por que esse item faria diferença?"
                    aria-label={`Motivo: ${it?.name ?? m.itemId}`}
                    onChange={(e) => {
                      const reason = e.target.value;
                      setMissing((list) => list.map((x, j) => (j === i ? { ...x, reason } : x)));
                      setStatus({ kind: "idle" });
                    }}
                    className="mt-1 w-full rounded-md border border-line bg-background px-2 py-1 text-xs text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ember"
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Tirar ${it?.name ?? "item"}`}
                  onClick={() => setMissing((list) => list.filter((_, j) => j !== i))}
                  className="mt-1 rounded p-1 text-muted-foreground hover:text-ink"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
        </ul>
        {missing.length < NOTE_LIMITS.items && (
          <ItemPicker
            items={items}
            exclude={new Set(missing.map((m) => m.itemId))}
            onPick={(id) => {
              setMissing((list) => [...list, { itemId: id, reason: "" }]);
              setStatus({ kind: "idle" });
            }}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          {saved &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Apagar a nota desta partida?</span>
                <button type="button" onClick={remove} className="font-semibold text-loss hover:underline">
                  Apagar
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted-foreground hover:text-ink">
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-sm text-muted-foreground hover:text-loss"
              >
                Apagar nota
              </button>
            ))}
        </div>
        <div className="flex items-center gap-3">
          <p role="status" className={cn("text-xs", status.kind === "error" ? "text-loss" : "text-muted-foreground")}>
            {status.kind === "saving"
              ? "Salvando…"
              : status.kind === "saved"
                ? "Salvo"
                : status.kind === "error"
                  ? status.message
                  : dirty
                    ? "Alterações não salvas"
                    : ""}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || status.kind === "saving"}
            className="rounded-md bg-ember px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Salvar nota
          </button>
        </div>
      </div>
    </section>
  );
}

function SideEditor({
  side,
  title,
  options,
  selected,
  text,
  onToggle,
  onAdd,
  onText,
}: {
  side: Side;
  title: string;
  options: string[];
  selected: string[];
  text: string;
  onToggle: (tag: string) => void;
  onAdd: (tag: string) => boolean;
  onText: (text: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const keys = new Set(selected.map(tagKey));
  const on = side === "good" ? "border-win/60 bg-win/15 text-win" : "border-loss/60 bg-loss/15 text-loss";

  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <h3 className={cn("text-xs font-semibold uppercase tracking-wide", side === "good" ? "text-win" : "text-loss")}>
        {title}
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((t) => {
          const active = keys.has(tagKey(t));
          return (
            <button
              key={t}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(t)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                active ? on : "border-line text-muted-foreground hover:text-ink",
              )}
            >
              {t}
            </button>
          );
        })}
        {adding ? (
          <input
            autoFocus
            value={draft}
            maxLength={NOTE_LIMITS.tag}
            placeholder="Nova etiqueta"
            aria-label={`Nova etiqueta em ${title}`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (onAdd(draft)) {
                  setDraft("");
                  setAdding(false);
                }
              } else if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            onBlur={() => {
              if (draft.trim()) onAdd(draft);
              setDraft("");
              setAdding(false);
            }}
            className="w-36 rounded-full border border-line bg-background px-2.5 py-0.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-ember"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted-foreground hover:text-ink"
          >
            <Plus className="h-3 w-3" strokeWidth={2} /> etiqueta
          </button>
        )}
      </div>
      <textarea
        value={text}
        maxLength={NOTE_LIMITS.text}
        rows={3}
        placeholder={side === "good" ? "O que funcionou nesta partida?" : "O que deu errado e o que faria diferente?"}
        aria-label={`Texto de ${title}`}
        onChange={(e) => onText(e.target.value)}
        className="mt-2 w-full resize-y rounded-md border border-line bg-background px-2 py-1.5 text-sm text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ember"
      />
      <p className="text-right text-[10px] tabular-nums text-muted-foreground">
        {text.length}/{NOTE_LIMITS.text}
      </p>
    </div>
  );
}

const plain = (s: string) => tagKey(s); // busca sem acento e sem maiúsculas

function ItemPicker({
  items,
  exclude,
  onPick,
}: {
  items: PickerItem[];
  exclude: Set<number>;
  onPick: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(false);
  const q = plain(query.trim());
  const matches = q
    ? items.filter((i) => !exclude.has(i.id) && plain(i.name).includes(q)).slice(0, 8)
    : [];

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="mt-2 inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted-foreground hover:text-ink"
      >
        <Plus className="h-3 w-3" strokeWidth={2} /> item que faltou
      </button>
    );
  }
  return (
    <div className="relative mt-2 max-w-sm">
      <input
        autoFocus
        value={query}
        placeholder="Nome do item (ex.: Force Staff)"
        aria-label="Buscar item"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            setActive(false);
          } else if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            onPick(matches[0].id);
            setQuery("");
            setActive(false);
          }
        }}
        className="w-full rounded-md border border-line bg-background px-2 py-1 text-sm text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ember"
      />
      {matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-panel shadow-lg">
          {matches.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(i.id);
                  setQuery("");
                  setActive(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-ink hover:bg-white/5"
              >
                {i.img ? (
                  <Image src={i.img} alt="" width={33} height={24} className="rounded-sm" />
                ) : (
                  <span className="h-6 w-[33px] rounded-sm bg-line" />
                )}
                {i.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setActive(false);
        }}
        className="mt-1 text-xs text-muted-foreground hover:text-ink"
      >
        Cancelar
      </button>
    </div>
  );
}

