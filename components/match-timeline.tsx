"use client";

import { useEffect, useRef, useState } from "react";
import {
  averageSoFar,
  axisMax,
  beforeAfter,
  markerRows,
  minuteTicks,
  rhythm,
  type BigPurchase,
  type ViewTimeline,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";

// Linha do tempo do herói (v2.2, mockup B): leitura do minuto, ícones dos
// itens grandes na hora da compra, gráfico do ritmo (ouro OU XP) e a barra.

type Series = "gold" | "xp";
const SERIES: Record<Series, { color: string; label: string; avg: string; short: string }> = {
  // Cores conferidas contra o fundo do painel (contraste e daltonismo).
  gold: { color: "#b98a2b", label: "Ritmo de ouro", avg: "GPM até aqui", short: "Ouro" },
  xp: { color: "#4a94d8", label: "Ritmo de XP", avg: "XPM até aqui", short: "XP" },
};

const LABEL = "text-[10px] font-semibold uppercase tracking-[.12em] text-ember";
const SMALL = "text-[10px] uppercase tracking-[.1em] text-muted-foreground";
const L = 46; // margem esquerda do gráfico (rótulos do eixo); faixa e barra usam a mesma
const R = 14;
const CHART_H = 190;
const TOP = 8;
const BOTTOM = 20;
// Ícone de item: tamanho do resto do site; menor em tela estreita, onde os
// itens da faixa ficariam um em cima do outro.
const ICON = { w: 33, h: 24 };
const ICON_SMALL = { w: 24, h: 18 };

const nf = new Intl.NumberFormat("pt-BR");
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type Tip = { x: number; y: number; title: string; lines: string[] };

export function MatchTimeline({
  timeline,
  minute,
  onMinuteChange,
}: {
  timeline: ViewTimeline;
  minute: number;
  onMinuteChange: (m: number) => void;
}) {
  const [series, setSeries] = useState<Series>("gold");
  const [width, setWidth] = useState(640);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hoverMinute, setHoverMinute] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // A largura vem do contêiner: o gráfico redesenha ao redimensionar.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { gold, xp, big } = timeline;
  const last = Math.max(1, gold.length - 1); // nunca divide por zero
  const plotW = Math.max(1, width - L - R);
  const xOf = (m: number) => L + (Math.max(0, Math.min(m, last)) / last) * plotW;
  const minuteAt = (clientX: number, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / Math.max(1, r.width)) * width;
    return Math.max(0, Math.min(last, Math.round(((px - L) / plotW) * last)));
  };

  const data = series === "gold" ? gold : xp;
  const values = data.map((_, m) => rhythm(data, m));
  const { max, step } = axisMax(values);
  const y = (v: number) => TOP + (1 - v / max) * (CHART_H - TOP - BOTTOM);
  const points = values.map((v, m) => `${xOf(m).toFixed(1)},${y(v).toFixed(1)}`);
  const s = SERIES[series];

  const closed = big.filter((p) => p.time <= minute * 60);
  const icon = width < 480 ? ICON_SMALL : ICON;
  const rows = markerRows(big.map((p) => xOf(p.time / 60)), icon.w + 3);

  return (
    <section aria-label="Linha do tempo" className="relative flex flex-col gap-3">
      <p className={LABEL}>Linha do tempo</p>

      {/* Leitura do minuto escolhido */}
      <div className="flex flex-wrap items-end gap-x-7 gap-y-2">
        <div>
          <span className={SMALL}>Minuto</span>
          <b className="block font-display text-3xl font-bold leading-none tabular-nums">{minute}:00</b>
        </div>
        {(["gold", "xp"] as const).map((k) => {
          const arr = k === "gold" ? gold : xp;
          return (
            <div key={k} className="min-w-[11rem]">
              <span className={SMALL}>
                <span aria-hidden className="mr-1.5 inline-block h-[3px] w-2.5 rounded-sm align-middle" style={{ background: SERIES[k].color }} />
                {SERIES[k].label} (últimos 3 min)
              </span>
              <div>
                <span className="text-xl font-semibold tabular-nums">{nf.format(rhythm(arr, minute))}</span>
                <span className="text-xs text-muted-foreground"> por min</span>
              </div>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {SERIES[k].avg}: {nf.format(averageSoFar(arr, minute))}
              </span>
            </div>
          );
        })}
        <div className="flex basis-full flex-wrap items-center gap-1.5">
          <span className={SMALL}>Fechados até aqui</span>
          {closed.length === 0 ? (
            <span className="text-xs text-muted-foreground">nenhum item grande ainda</span>
          ) : (
            closed.map((p) => (
              <ItemIcon key={`${p.key}-${p.time}`} item={p} size={ICON} title={`${p.name} · ${clock(p.time)}`} />
            ))
          )}
        </div>
      </div>

      <div ref={boxRef} className="relative w-full">
        {/* Ícones dos itens grandes, na hora em que foram fechados */}
        {big.length > 0 && (
          <div className="relative" style={{ height: icon.h * 2 + 6 }}>
            {big.map((p, i) => {
              const x = xOf(p.time / 60);
              const { before, after } = beforeAfter(gold, p.time);
              const show = () =>
                setTip({
                  x,
                  y: rows[i] === 0 ? icon.h + 6 : 0,
                  title: `${p.name} · ${clock(p.time)} · ${nf.format(p.cost)} de ouro`,
                  lines: [`Ritmo de ouro: ${nf.format(before)} antes → ${nf.format(after)} três minutos depois`],
                });
              return (
                <button
                  key={`${p.key}-${p.time}`}
                  type="button"
                  aria-label={`${p.name} fechado aos ${clock(p.time)}`}
                  onMouseEnter={show}
                  onFocus={show}
                  onMouseLeave={() => setTip(null)}
                  onBlur={() => setTip(null)}
                  onClick={() => onMinuteChange(Math.round(p.time / 60))}
                  className={cn(
                    "absolute rounded-[3px] transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ember",
                    p.time > minute * 60 && "opacity-40 hover:opacity-100",
                  )}
                  style={{ left: x - icon.w / 2, top: rows[i] === 0 ? icon.h + 6 : 0 }}
                >
                  <ItemIcon item={p} size={icon} />
                </button>
              );
            })}
          </div>
        )}

        {/* Título do gráfico + Ouro | XP */}
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden className="inline-block h-[3px] w-2.5 rounded-sm" style={{ background: s.color }} />
          <span>
            <strong className="font-semibold text-ink">{s.label}</strong> por minuto
          </span>
          <div role="group" aria-label="Curva do gráfico" className="ml-auto inline-flex overflow-hidden rounded-md border border-line">
            {(["gold", "xp"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={series === k}
                onClick={() => setSeries(k)}
                className={cn("px-3 py-1 text-xs", series === k ? "bg-white/5 text-ink" : "text-muted-foreground hover:text-ink")}
              >
                {SERIES[k].short}
              </button>
            ))}
          </div>
        </div>

        <svg
          role="img"
          aria-label={`${s.label} ao longo da partida`}
          viewBox={`0 0 ${width} ${CHART_H}`}
          width="100%"
          height={CHART_H}
          className="block cursor-crosshair touch-none select-none"
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            onMinuteChange(minuteAt(e.clientX, e.currentTarget));
          }}
          onPointerUp={() => (dragging.current = false)}
          onPointerMove={(e) => {
            const m = minuteAt(e.clientX, e.currentTarget);
            if (dragging.current) onMinuteChange(m);
            setHoverMinute(dragging.current ? null : m);
          }}
          onPointerLeave={() => setHoverMinute(null)}
        >
          {Array.from({ length: max / step + 1 }, (_, i) => i * step).map((v) => (
            <g key={v}>
              <line x1={L} x2={width - R} y1={y(v)} y2={y(v)} stroke="#23262c" />
              <text x={L - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {nf.format(v)}
              </text>
            </g>
          ))}
          {minuteTicks(last, plotW).map((m) => (
            <text key={m} x={xOf(m)} y={CHART_H - 5} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {m} min
            </text>
          ))}
          {big.map((p) => (
            <line
              key={`l-${p.key}-${p.time}`}
              x1={xOf(p.time / 60)}
              x2={xOf(p.time / 60)}
              y1={TOP}
              y2={CHART_H - BOTTOM}
              stroke="#3a3e46"
              strokeDasharray="2 3"
            />
          ))}
          <path d={`M${xOf(0)},${y(0)} L${points.join(" L")} L${xOf(last)},${y(0)} Z`} fill={s.color} opacity={0.13} />
          <path d={`M${points.join(" L")}`} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hoverMinute !== null && hoverMinute !== minute && (
            <line x1={xOf(hoverMinute)} x2={xOf(hoverMinute)} y1={TOP} y2={CHART_H - BOTTOM} stroke="#8b8f98" strokeDasharray="3 3" />
          )}
          <line x1={xOf(minute)} x2={xOf(minute)} y1={TOP} y2={CHART_H - BOTTOM} stroke="#f2efe8" strokeWidth={1.5} />
          <circle cx={xOf(minute)} cy={y(values[Math.min(minute, values.length - 1)] ?? 0)} r={5} fill={s.color} stroke="#12151a" strokeWidth={2} />
        </svg>

        {hoverMinute !== null && (
          <div
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-[#1b1f26] px-2 py-1.5 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(0, xOf(hoverMinute) - 80), width - 170), bottom: 40 }}
          >
            <b className="font-semibold tabular-nums">{nf.format(values[hoverMinute] ?? 0)}</b> por min
            <span className="block text-[11px] text-muted-foreground">
              minuto {hoverMinute} · {s.avg.toLowerCase()}: {nf.format(averageSoFar(data, hoverMinute))}
            </span>
          </div>
        )}

        {tip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-[#1b1f26] px-2 py-1.5 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(0, tip.x - 140), width - 290), top: tip.y + icon.h + 4 }}
          >
            <b className="font-semibold">{tip.title}</b>
            {tip.lines.map((l) => (
              <span key={l} className="block text-[11px] text-muted-foreground">
                {l}
              </span>
            ))}
          </div>
        )}

        {/* Barra: funciona no teclado e no toque */}
        <div style={{ paddingLeft: L - 8, paddingRight: R - 8 }}>
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={minute}
            onChange={(e) => onMinuteChange(Number(e.target.value))}
            aria-label="Minuto da partida"
            aria-valuetext={`minuto ${minute}`}
            className="h-5 w-full cursor-pointer accent-ember"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Ícones apagados = itens ainda não fechados nesse minuto. Passe o mouse num ícone para ver o ritmo antes e depois dele.
      </p>

      {big.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-ink">Ver itens em tabela</summary>
          <table className="mt-2 w-full max-w-md text-left">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Item</th>
                <th className="font-medium">Fechado</th>
                <th className="font-medium">Ritmo de ouro antes → depois</th>
              </tr>
            </thead>
            <tbody>
              {big.map((p) => {
                const { before, after } = beforeAfter(gold, p.time);
                return (
                  <tr key={`t-${p.key}-${p.time}`} className="border-t border-line">
                    <td className="py-1">{p.name}</td>
                    <td className="tabular-nums">{clock(p.time)}</td>
                    <td className="tabular-nums">
                      {nf.format(before)} → {nf.format(after)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

/** Ícone do item; sem imagem (ou se falhar), as iniciais num selo — nunca imagem quebrada. */
function ItemIcon({
  item,
  size,
  title,
}: {
  item: BigPurchase;
  size: { w: number; h: number };
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size.w, height: size.h };
  if (item.img && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.img}
        alt={title ? item.name : ""}
        title={title}
        width={size.w}
        height={size.h}
        loading="lazy"
        onError={() => setFailed(true)}
        className="block rounded-[3px] border border-line bg-black object-cover"
        style={box}
      />
    );
  }
  const initials = item.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <span
      title={title}
      className="flex items-center justify-center rounded-[3px] border border-line bg-panel text-[9px] font-semibold text-muted-foreground"
      style={box}
    >
      {initials}
    </span>
  );
}
