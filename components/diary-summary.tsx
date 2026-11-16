import Image from "next/image";
import Link from "next/link";
import type { DiarySummary, TagStat, Trend } from "@/lib/diary";
import { formatStartTime } from "@/lib/match";
import type { Hero, Item } from "@/lib/opendota";
import { cn } from "@/lib/utils";

// Resumo do diário (v2.4, mockup B): o que mais deu errado e certo, quanto
// cada coisa custou em vitórias, setas contra o período anterior, os textos
// e os itens que mais faltaram. Servidor: datas no fuso de São Paulo.

const TEXTS_SHOWN = 3;

export function DiarySummaryView({
  summary,
  heroes,
  items,
  accountId,
}: {
  summary: DiarySummary;
  heroes: Record<number, Hero>;
  items: Record<number, Item>;
  accountId: number;
}) {
  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        <span className="font-semibold text-ink">
          {summary.total} {summary.total === 1 ? "partida anotada" : "partidas anotadas"}
        </span>{" "}
        · <span className="text-win">{summary.wins}V</span>{" "}
        <span className="text-loss">{summary.losses}D</span>
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <TagColumn
          title="Mais deu errado"
          side="bad"
          stats={summary.bad}
          total={summary.total}
          heroes={heroes}
          accountId={accountId}
        />
        <TagColumn
          title="Mais deu certo"
          side="good"
          stats={summary.good}
          total={summary.total}
          heroes={heroes}
          accountId={accountId}
        />
      </div>

      <section className="mt-4 rounded-md border border-line bg-panel p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">Itens que mais faltaram</h3>
        {summary.items.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum item anotado neste filtro.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {summary.items.map((s) => {
              const it = items[s.itemId];
              return (
                <li key={s.itemId} className="flex items-start gap-2.5">
                  {it?.img ? (
                    <Image src={it.img} alt="" width={36} height={26} className="mt-0.5 shrink-0 rounded-sm" />
                  ) : (
                    <span className="mt-0.5 h-[26px] w-9 shrink-0 rounded-sm bg-line" />
                  )}
                  <p className="text-sm">
                    <span className="font-semibold text-ink">{it?.name ?? `Item #${s.itemId}`}</span>
                    <span className="text-muted-foreground"> · {s.count}×</span>
                    {s.reasons.length > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {s.reasons.slice(0, 3).map((r) => `"${r}"`).join(" · ")}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function TagColumn({
  title,
  side,
  stats,
  total,
  heroes,
  accountId,
}: {
  title: string;
  side: "good" | "bad";
  stats: TagStat[];
  total: number;
  heroes: Record<number, Hero>;
  accountId: number;
}) {
  return (
    <section className="rounded-md border border-line bg-panel p-4">
      <h3 className={cn("text-xs font-semibold uppercase tracking-wide", side === "bad" ? "text-loss" : "text-win")}>
        {title}
      </h3>
      {stats.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma etiqueta marcada neste filtro.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-4">
          {stats.map((s) => (
            <li key={s.tag}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span>
                  <span className="font-semibold text-ink">{s.tag}</span>
                  <TrendText trend={s.trend} before={s.before} side={side} />
                </span>
                <span className="text-xs text-muted-foreground">
                  em {s.count} de {total}
                  {s.decided > 0 && <> · venceu {Math.round((s.wins / s.decided) * 100)}%</>}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                <div
                  className={cn("h-full rounded-full", side === "bad" ? "bg-loss" : "bg-win")}
                  style={{ width: `${Math.round((s.count / Math.max(total, 1)) * 100)}%` }}
                />
              </div>
              {s.texts.length > 0 && (
                <TextList texts={s.texts} side={side} heroes={heroes} accountId={accountId} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TextList({
  texts,
  side,
  heroes,
  accountId,
}: {
  texts: TagStat["texts"];
  side: "good" | "bad";
  heroes: Record<number, Hero>;
  accountId: number;
}) {
  const row = (t: TagStat["texts"][number]) => (
    <li
      key={t.matchId}
      className={cn("border-l-2 pl-2 text-xs", side === "bad" ? "border-loss/60" : "border-win/60")}
    >
      <p className="whitespace-pre-line text-ink/90">{t.text}</p>
      <Link
        href={`/match/${t.matchId}?player=${accountId}#nota`}
        className="text-[11px] text-muted-foreground hover:text-ink"
      >
        {heroes[t.heroId]?.name ?? `hero_id ${t.heroId}`} · {formatStartTime(Date.parse(t.playedAt) / 1000)}
        {t.won !== null && <> · {t.won ? "Vitória" : "Derrota"}</>}
      </Link>
    </li>
  );
  const first = texts.slice(0, TEXTS_SHOWN);
  const rest = texts.slice(TEXTS_SHOWN);
  return (
    <div className="mt-2">
      <ul className="flex flex-col gap-1.5">{first.map(row)}</ul>
      {rest.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer select-none text-[11px] text-muted-foreground hover:text-ink">
            Mais {rest.length} {rest.length === 1 ? "texto" : "textos"}
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1.5">{rest.map(row)}</ul>
        </details>
      )}
    </div>
  );
}

/** Seta contra o período anterior. "Deu errado" caindo é bom (verde); subindo, ruim. */
function TrendText({
  trend,
  before,
  side,
}: {
  trend: Trend;
  before: TagStat["before"];
  side: "good" | "bad";
}) {
  if (trend === null || before === null) return null;
  if (trend === "new") return <span className="ml-2 text-[11px] text-muted-foreground">novo</span>;
  const was = `antes ${before.count} de ${before.total}`;
  if (trend === "same") return <span className="ml-2 text-[11px] text-muted-foreground">= {was}</span>;
  const good = (trend === "down") === (side === "bad");
  return (
    <span className={cn("ml-2 text-[11px]", good ? "text-win" : "text-loss")}>
      {trend === "up" ? "▲" : "▼"} {was}
    </span>
  );
}
