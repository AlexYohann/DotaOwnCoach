# v2.2 Linha do tempo do herói — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No painel do herói da tela da partida, uma barra de tempo sobre um gráfico do ritmo de ouro/XP com os itens grandes marcados, só para quem está logado, pedindo o processamento da partida à OpenDota quando ele ainda não existe.

**Architecture:** Os dados minuto a minuto (`gold_t`, `xp_t`, `purchase_log`) entram no detalhe da partida que já é guardado no Supabase. As contas (ritmo, média, item grande) são regras puras em `lib/timeline.ts`. O pedido de processamento é uma rota do servidor com quatro guardas (login, idade, teto diário, reserva por partida); a tela pede, acompanha a cada 8 s e chama `router.refresh()` quando fica pronto. O gráfico é um componente cliente em SVG, sem biblioteca.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents: true`), Supabase (Postgres, `@supabase/supabase-js`), Tailwind v3, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-v2-2-linha-do-tempo-design.md` — leia antes de qualquer tarefa. Mockup (opção B): `.superpowers/brainstorm/20765-1794585467/content/linha-do-tempo.html`.

## Global Constraints

- OpenDota só no servidor e só em `lib/opendota.ts`. Páginas e rotas chamam `lib/data.ts` / `lib/match-parse.ts`.
- Gravações disparadas por uma **página** rodam dentro de `after()`. A rota de processamento grava dentro da resposta (a tela lê o banco em seguida).
- Coluna nova com o RLS explicado em comentário na migração. Migração aplicada pelo MCP (`apply_migration`), `.sql` em `supabase/migrations/`, `get_advisors` (security) depois.
- Nenhum segredo em `NEXT_PUBLIC_` nem em código do cliente. Componente cliente só importa de `lib/timeline.ts` (sem `server-only`) e tipos.
- `cacheComponents: true`: leitura de cookie/params/dados fica dentro de `<Suspense>` (a página da partida já está).
- Tema só escuro; cores `panel`, `line`, `ink`, `ember`; títulos `font-display`. Cores das curvas: ouro `#b98a2b`, XP `#4a94d8` (já validadas contra `#12151a`). Texto e números nunca na cor da curva.
- Sem biblioteca de gráficos. Um eixo por gráfico.
- Textos da interface em português, exatamente como no spec. Explicar ao Alex o que mudou e por quê, em português.
- `npm test` antes de cada commit. Commits no branch `v2.2`. **Nenhum push sem ok do Alex.**
- Valores do spec: janela do ritmo 3 min; item grande = montado e custo ≥ 2.000, comprado depois do minuto 0; idade máxima 14 dias; teto 50 pedidos em 24 h; acompanhamento a cada 8 s, no máximo 12 vezes; pedido em andamento há mais de 1 dia = resolvido sem sucesso; minuto inicial = o do primeiro item grande, senão 10 (ou o último minuto, se a partida for mais curta).

## Review Focus

1. **Partida curtíssima** (abandono: `gold_t` com 2 ou 3 pontos): ritmo, eixo, minuto inicial e barra funcionam sem divisão por zero nem índice fora da lista. → Tarefas 1 e 5.
2. **`gold_t` e `xp_t` de tamanhos diferentes, com `null` no meio, ou `purchase_log` com entradas tortas**: aquele jogador fica sem linha do tempo; a partida e os outros jogadores abrem normalmente. → Tarefa 2.
3. **Item comprado que não está na lista de itens** (item novo do patch, ou `getItems` devolveu `{}`): é ignorado; a linha do tempo aparece sem aquele ícone (ou sem ícone nenhum), sem quebrar. → Tarefa 1.
4. **Dois pedidos ao mesmo tempo** (duas abas, StrictMode, duplo carregamento): um único `POST` à OpenDota; o outro recebe `pending`. → Tarefa 3.
5. **OpenDota fora do ar durante o acompanhamento, ou a sessão expira com a página aberta**: a consulta responde `pending` (sem marcar como falha) / 401; a tela para de consultar no 401 e mostra o convite de login. → Tarefas 3, 4 e 6.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/timeline.ts` (novo, puro) | Tipos da linha do tempo, ritmo, média, item grande, antes → depois, eixo, fileiras dos ícones, minuto inicial, estado da seção |
| `lib/opendota.ts` | `Item.key`/`assembled`; `MatchDetail.parsed`; `MatchPlayer.timeline`; `requestParse`, `getParseJob` |
| `lib/data.ts` | `DETAIL_VERSION` 4; `refreshMatchDetail` |
| `lib/match-parse.ts` (novo, `server-only`) | Guardas e estado do pedido de processamento |
| `supabase/migrations/20261113000000_v2_2_match_parse.sql` (novo) | Colunas `parse_requested_at`, `parse_job_id` |
| `app/match/[id]/parse/route.ts` (novo) | `POST` pede, `GET` acompanha; exige login |
| `app/match/[id]/page.tsx` | Lê quem está vendo; monta a visão da linha do tempo; não envia os dados a deslogados |
| `components/match-timeline.tsx` (novo, cliente) | Leitura do minuto, ícones, gráfico, barra, tabela |
| `components/match-timeline-gate.tsx` (novo, cliente) | Convite de login; pedido, acompanhamento e mensagens |
| `components/match-view.tsx` | Guarda o minuto escolhido; encaixa a seção no painel do herói |

---

### Task 1: Regras puras (`lib/timeline.ts`)

**Files:**
- Create: `lib/timeline.ts`, `tests/timeline.test.ts`

**Interfaces — Produces:**

```ts
// lib/timeline.ts (sem "server-only": o componente cliente também usa)
export type Purchase = { time: number; key: string };            // time em segundos; pode ser negativo
export type Timeline = { gold: number[]; xp: number[]; purchases: Purchase[] }; // índice = minuto
export type ItemInfo = { key: string; name: string; img: string | null; cost: number | null; assembled: boolean };
export type BigPurchase = { time: number; key: string; name: string; img: string | null; cost: number };
export type ViewTimeline = { gold: number[]; xp: number[]; big: BigPurchase[] };
export type TimelineState = "ready" | "login" | "unparsed";

export const RHYTHM_WINDOW = 3;
export const BIG_ITEM_MIN_COST = 2000;

export function rhythm(series: number[], minute: number): number;
export function averageSoFar(series: number[], minute: number): number;
export function bigPurchases(purchases: Purchase[], itemsByKey: Record<string, ItemInfo>): BigPurchase[]; // ordenado por time
export function beforeAfter(series: number[], timeSeconds: number): { before: number; after: number };
export function axisMax(values: number[]): { max: number; step: number };
export function markerRows(xs: number[], minGap: number): (0 | 1)[];
export function defaultMinute(big: BigPurchase[], lastMinute: number): number;
export function clampMinute(minute: number, lastMinute: number): number;
export function toViewTimeline(t: Timeline | null, itemsByKey: Record<string, ItemInfo>): ViewTimeline | null;
export function timelineState(viewerId: number | null, parsed: boolean): TimelineState;
```

- [ ] **Step 1: Escrever os testes (falhando)** em `tests/timeline.test.ts`. Dados reais da partida `9070527945` (Anti-Mage, primeiros 20 minutos):

```ts
const GOLD = [0, 170, 559, 858, 1497, 2077, 2650, 3197, 3527, 4142, 4665, 5026, 5341, 6006, 6957, 7711, 8361, 8863, 10056, 10925];
const XP = [14, 14, 261, 437, 1218, 1478, 1977, 2523, 2703, 3201, 3716, 4168, 4363, 5195, 6547, 7206, 8251, 8960, 10716, 12002];

// rhythm: (s[m] − s[max(0, m−3)]) / min(3, m), arredondado
expect([0, 1, 2, 3, 12, 15, 16].map((m) => rhythm(GOLD, m))).toEqual([0, 170, 280, 286, 400, 790, 785]);
expect(rhythm(XP, 16)).toBe(1019);
expect(rhythm(GOLD, -1)).toBe(0);
expect(rhythm(GOLD, 99)).toBe(rhythm(GOLD, 19));   // minuto além do fim = último
expect(rhythm([0, 300], 1)).toBe(300);             // partida de 1 minuto
expect(rhythm([], 0)).toBe(0);

// averageSoFar: s[m] / m
expect([0, 1, 12, 16].map((m) => averageSoFar(GOLD, m))).toEqual([0, 170, 445, 523]);
expect(averageSoFar(XP, 16)).toBe(516);
expect(averageSoFar([], 3)).toBe(0);

// bigPurchases
const ITEMS = {
  bfury:        { key: "bfury", name: "Battle Fury", img: "b.png", cost: 3900, assembled: true },
  power_treads: { key: "power_treads", name: "Power Treads", img: "p.png", cost: 1400, assembled: true },
  yasha:        { key: "yasha", name: "Yasha", img: "y.png", cost: 2100, assembled: true },
  eagle:        { key: "eagle", name: "Eaglesong", img: "e.png", cost: 2800, assembled: false },
  relic:        { key: "relic", name: "Sacred Relic", img: null, cost: null, assembled: true },
  manta:        { key: "manta", name: "Manta Style", img: "m.png", cost: 2000, assembled: true },
};
const log = [
  { time: 1107, key: "manta" }, { time: 756, key: "bfury" }, { time: 266, key: "power_treads" },
  { time: 907, key: "yasha" }, { time: 1246, key: "eagle" }, { time: 300, key: "relic" },
  { time: 400, key: "item_que_nao_existe" }, { time: -90, key: "bfury" }, { time: 0, key: "yasha" },
];
expect(bigPurchases(log, ITEMS).map((p) => [p.key, p.time])).toEqual([["bfury", 756], ["yasha", 907], ["manta", 1107]]);
expect(bigPurchases(log, ITEMS)[0]).toEqual({ time: 756, key: "bfury", name: "Battle Fury", img: "b.png", cost: 3900 });
expect(bigPurchases(log, {})).toEqual([]);          // getItems falhou: sem ícones, sem erro

// beforeAfter: ritmo no minuto da compra e 3 minutos depois (limitado ao fim)
expect(beforeAfter(GOLD, 756)).toEqual({ before: 400, after: 790 });   // 12:36 → minutos 12 e 15
expect(beforeAfter(GOLD, 18 * 60 + 30)).toEqual({ before: rhythm(GOLD, 18), after: rhythm(GOLD, 19) });

// axisMax: teto redondo; passo 500 até 1.600 de máximo, 1.000 acima
expect(axisMax([0, 785, 1381])).toEqual({ max: 1500, step: 500 });
expect(axisMax([0, 2152])).toEqual({ max: 3000, step: 1000 });
expect(axisMax([])).toEqual({ max: 500, step: 500 });
expect(axisMax([0, 0])).toEqual({ max: 500, step: 500 });

// markerRows: vai para a fileira 1 quem está a menos de minGap do último da fileira 0
expect(markerRows([10, 100, 120, 300, 310, 320], 36)).toEqual([0, 0, 1, 0, 1, 1]);
expect(markerRows([], 36)).toEqual([]);

// defaultMinute / clampMinute
expect(defaultMinute([{ time: 756, key: "bfury", name: "", img: null, cost: 3900 }], 47)).toBe(13); // arredonda 12:36
expect(defaultMinute([], 47)).toBe(10);
expect(defaultMinute([], 4)).toBe(4);
expect(clampMinute(-3, 47)).toBe(0);
expect(clampMinute(99, 47)).toBe(47);
expect(clampMinute(12.6, 47)).toBe(13);

// toViewTimeline
expect(toViewTimeline(null, ITEMS)).toBeNull();
expect(toViewTimeline({ gold: GOLD, xp: XP, purchases: log }, ITEMS)).toEqual({ gold: GOLD, xp: XP, big: bigPurchases(log, ITEMS) });

// timelineState: deslogado nunca vê, nem partida processada
expect(timelineState(null, true)).toBe("login");
expect(timelineState(null, false)).toBe("login");
expect(timelineState(7, true)).toBe("ready");
expect(timelineState(7, false)).toBe("unparsed");
```

- [ ] **Step 2:** `npx vitest run tests/timeline.test.ts` → FALHA (módulo não existe).
- [ ] **Step 3:** Implementar `lib/timeline.ts`. `rhythm`/`averageSoFar` limitam o minuto a `[0, series.length − 1]`. `beforeAfter`: `m0 = floor(time / 60)`, `after` em `min(m0 + 3, último)`. `defaultMinute`: `Math.round(big[0].time / 60)` limitado a `lastMinute`.
- [ ] **Step 4:** Mesmo comando → PASSA. `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit `feat(v2.2): regras puras da linha do tempo`.

---

### Task 2: OpenDota — dados por minuto, itens e pedido de processamento

**Files:**
- Modify: `lib/opendota.ts`, `tests/opendota.test.ts`

**Interfaces:**
- Consumes: `Timeline` (T1).
- Produces:

```ts
export type Item = { /* campos atuais */ key: string; assembled: boolean };  // key = chave em /constants/items ("bfury"); assembled = tem components
export type MatchDetail = { /* campos atuais */ parsed: boolean };            // version != null
export type MatchPlayer = { /* campos atuais */ timeline: Timeline | null };
export async function requestParse(matchId: number): Promise<number>;        // jobId; lança OpenDotaError
export async function getParseJob(jobId: number): Promise<"pending" | "done">; // lança OpenDotaError
```

- [ ] **Step 1: Testes** (no padrão de `fetchMock`/`json` do arquivo):
  - `getMatch` com `version: 22` e um jogador com `gold_t: [0, 170, 559]`, `xp_t: [14, 14, 261]`, `purchase_log: [{ time: -90, key: "tango" }, { time: 266, key: "recipe_power_treads" }, { time: 266, key: "power_treads" }, { time: "x", key: "bfury" }, { key: "yasha" }, null]` → `parsed === true`; `timeline` = `{ gold: [0, 170, 559], xp: [14, 14, 261], purchases: [{ time: -90, key: "tango" }, { time: 266, key: "power_treads" }] }` (receita e entradas tortas fora).
  - Mesma partida sem `version` (ou `version: null`) → `parsed === false` e `timeline === null` em todos, mesmo que os campos venham.
  - **Review Focus 2**, partida processada: `gold_t` e `xp_t` de tamanhos diferentes → `timeline === null`; `gold_t: [0, null, 300]` → `null`; `gold_t` com 1 ponto só → `null`; `purchase_log` ausente → `timeline` com `purchases: []`; jogador ao lado com dados bons mantém a `timeline`.
  - `getItems`: item `bfury` com `components: ["broadsword", "claymore"]` → `key: "bfury"`, `assembled: true`; item com `components: null` → `assembled: false`.
  - `requestParse(99)`: faz `POST` em `https://api.opendota.com/api/request/99`; resposta `{ job: { jobId: 639527695 } }` → `639527695`; resposta sem `job.jobId` numérico → lança `unavailable`; 429 → `rate_limit`.
  - `getParseJob(5)`: `GET …/request/5`; corpo `null` → `"done"`; corpo `{ id: 5, type: "parse" }` → `"pending"`; 500 → lança `unavailable`.
- [ ] **Step 2:** `npx vitest run tests/opendota.test.ts` → FALHA.
- [ ] **Step 3:** Implementar. `timeline` só é montada quando a partida está processada. As duas funções novas registram `[OpenDota] POST /request/…` e `[OpenDota] GET /request/…` no mesmo estilo das existentes. `getParseJob` precisa distinguir corpo `null` de 404: use `fetch` direto como em `requestPlayerRefresh`, não o `request()` que devolve `null` no 404; 404 → `"done"` (pedido que a OpenDota não conhece mais).
- [ ] **Step 4:** → PASSA. `npx tsc --noEmit` vai acusar os lugares que constroem `MatchDetail`/`Item` à mão em testes: ajuste os dados de exemplo.
- [ ] **Step 5:** `npm test`. Commit `feat(v2.2): OpenDota — dados por minuto, compras e pedido de processamento`.

---

### Task 3: Banco e estado do pedido (`lib/match-parse.ts`)

**Files:**
- Create: `supabase/migrations/20261113000000_v2_2_match_parse.sql`, `lib/match-parse.ts`, `tests/match-parse.test.ts`
- Modify: `lib/data.ts`, `tests/data.test.ts`

**Interfaces:**
- Consumes: `requestParse`, `getParseJob`, `getMatch`, `OpenDotaError` (T2).
- Produces:

```ts
// lib/data.ts
export async function refreshMatchDetail(matchId: number): Promise<MatchDetail | null>; // busca na OpenDota e GRAVA antes de devolver; lança OpenDotaError

// lib/match-parse.ts (server-only)
export const PARSE_MAX_AGE_MS = 14 * 86_400_000;
export const PARSE_DAILY_LIMIT = 50;
export const PARSE_GIVE_UP_MS = 86_400_000;
export type ParseRequestStatus = "requested" | "pending" | "ready" | "failed" | "too_old" | "limit" | "unavailable" | "unknown";
export type ParseCheckStatus = "pending" | "ready" | "failed" | "unknown";
export async function requestMatchParse(matchId: number, nowMs?: number): Promise<ParseRequestStatus>;
export async function checkMatchParse(matchId: number, nowMs?: number): Promise<ParseCheckStatus>;
```

- [ ] **Step 1: Migração**, com comentário em português:

```sql
-- v2.2: pedido de processamento do replay (linha do tempo do herói).
-- parse_requested_at: quando o site pediu à OpenDota; null = nunca pediu.
--   É a trava "um pedido por partida" e a base do teto diário.
-- parse_job_id: o pedido na OpenDota ENQUANTO o resultado não é conhecido;
--   volta a null quando o site descobre o desfecho.
-- Não se guarda quem pediu: matches tem leitura pública e isso revelaria
-- quem abriu qual partida.
-- RLS: nada muda. matches continua com leitura pública (política do v1.3) e
-- nenhuma política de escrita; só o servidor grava, com a secret key.
alter table public.matches
  add column parse_requested_at timestamptz,
  add column parse_job_id bigint;
-- O teto diário conta os pedidos das últimas 24 h.
create index matches_parse_requested_at_idx on public.matches (parse_requested_at)
  where parse_requested_at is not null;
```

- [ ] **Step 2:** Aplicar com o MCP `apply_migration` (nome `v2_2_match_parse`); `get_advisors` (security) sem alerta novo.
- [ ] **Step 3: Testes de `lib/data.ts`** (em `tests/data.test.ts`, nos dublês existentes): as versões dos casos de `getMatchData` passam a 4 (antiga = 3); detalhe salvo com `parsed: false` na versão atual **não** chama a OpenDota; `refreshMatchDetail`: chama `getMatch`, e a gravação em `matches` já aconteceu quando a função devolve (sem `flushAfter`); partida inexistente → `null` e nada gravado.
- [ ] **Step 4: Testes de `lib/match-parse.ts`** em `tests/match-parse.test.ts`. Dublês: Supabase admin falso que guarda uma linha de `matches` em memória e aplica o `UPDATE … WHERE parse_requested_at IS NULL` de verdade (a segunda reserva não acha linha); contagem do teto configurável; `@/lib/opendota` e `@/lib/data` (`refreshMatchDetail`) simulados. `NOW` fixo. Casos:
  1. linha inexistente, ou sem `detail` → `"unknown"`, nenhuma chamada à OpenDota.
  2. `detail.match.parsed === true` → `"ready"`, nenhuma chamada.
  3. partida de 15 dias → `"too_old"`, nada gravado; de 13 dias passa.
  4. teto: 50 pedidos nas últimas 24 h → `"limit"`, **`parse_requested_at` continua nulo**; 49 passa.
  5. caminho feliz: `"requested"`; `requestParse` chamada 1 vez; linha com `parse_requested_at` e `parse_job_id: 639527695`.
  6. **Review Focus 4:** duas chamadas simultâneas (`Promise.all`) → uma `"requested"` e uma `"pending"`; `requestParse` chamada 1 vez.
  7. `requestParse` lança → `"unavailable"`; `parse_requested_at` preenchido e `parse_job_id` nulo; chamar de novo → `"failed"` sem nova chamada à OpenDota.
  8. já pedido com `parse_job_id` → `"pending"`; já pedido sem `parse_job_id` → `"failed"`.
  9. `checkMatchParse`: nunca pedido → `"unknown"`; `getParseJob` `"pending"` → `"pending"`, nada gravado; `"done"` + `refreshMatchDetail` devolve partida processada → `"ready"` e `parse_job_id` nulo; `"done"` + partida não processada → `"failed"` e `parse_job_id` nulo.
  10. **Review Focus 5:** `getParseJob` lança `OpenDotaError` → `"pending"`, `parse_job_id` mantido.
  11. pedido em andamento há mais de 1 dia → `"failed"`, `parse_job_id` nulo, `getParseJob` não chamada.
  12. já resolvido: detalhe processado → `"ready"`; não processado → `"failed"`; `getParseJob` não chamada nos dois.
  13. sem secret key (`createAdminClient()` → `null`) → `requestMatchParse` `"unavailable"` e `checkMatchParse` `"unknown"`, sem chamadas.
- [ ] **Step 5:** `npx vitest run tests/data.test.ts tests/match-parse.test.ts` → FALHA.
- [ ] **Step 6:** Implementar. `DETAIL_VERSION = 4`. Ordem em `requestMatchParse`: conhecida → já processada → já pedida → idade → teto → reserva → OpenDota. O teto é um `select` com `count` em `matches` onde `parse_requested_at >= agora − 24 h`.
- [ ] **Step 7:** → PASSA. `npm test` inteiro. Commit `feat(v2.2): pedido de processamento com trava, idade e teto diário`.

---

### Task 4: Rota de processamento e página da partida

**Files:**
- Create: `app/match/[id]/parse/route.ts`
- Modify: `app/match/[id]/page.tsx`, `components/match-view.tsx` (só os tipos)

**Interfaces:**
- Consumes: `requestMatchParse`, `checkMatchParse` (T3); `getViewerAccountId` (`lib/account.ts`); `toViewTimeline`, `timelineState`, `ItemInfo`, `ViewTimeline`, `TimelineState` (T1).
- Produces:
  - `POST /match/<id>/parse` → `{ status: ParseRequestStatus }`; `GET` → `{ status: ParseCheckStatus }`; sem login → 401 `{ status: "login" }`; ID que não é só dígitos (1 a 20) → 400 `{ status: "unknown" }`. `Cache-Control: no-store` em tudo.
  - `ViewPlayer.timeline: ViewTimeline | null`; `MatchView` recebe `timelineState: TimelineState` e `summary.matchId` (já existe).

- [ ] **Step 1: Rota.** As duas funções conferem o login antes de qualquer outra coisa. `export const maxDuration = 30`.
- [ ] **Step 2: Página.** `getViewerAccountId()` entra no `Promise.all` existente. `itemsByKey` montado a partir de `items` (`Item.key` → `ItemInfo`). `state = timelineState(viewerId, match.parsed)`. Cada jogador: `timeline: state === "ready" ? toViewTimeline(p.timeline ?? null, itemsByKey) : null` — **deslogado, nenhum dado por minuto vai para o navegador**. Detalhe antigo sem `parsed`/`timeline` (não deve existir depois do `DETAIL_VERSION` 4, mas o campo é lido com `?? false` / `?? null`).
- [ ] **Step 3: Conferir** em `npm run build && npx next start`:
  - deslogado: `curl -s -X POST -o /dev/null -w "%{http_code}" localhost:3000/match/9070527945/parse` → `401`; `GET` → `401`;
  - deslogado: `curl -s "localhost:3000/match/9070527945?player=321580662" | grep -c '"gold"'` → `0`;
  - `curl … /match/abc/parse` → `400`;
  - a página da partida continua abrindo (os componentes novos ainda não existem: a seção não aparece).
- [ ] **Step 4:** `npm test`, `npm run lint`. Commit `feat(v2.2): rota de processamento e dados da linha do tempo só para logados`.

---

### Task 5: Componente da linha do tempo (`components/match-timeline.tsx`)

**Files:**
- Create: `components/match-timeline.tsx`

**Interfaces:**
- Consumes: tudo de `lib/timeline.ts` (T1).
- Produces: `MatchTimeline({ timeline, minute, onMinuteChange }: { timeline: ViewTimeline; minute: number; onMinuteChange: (m: number) => void })`. `minute` chega já limitado pelo pai.

Referência: o mockup, opção B. O código do mockup é descartável — reescrever em React, não copiar.

- [ ] **Step 1: Leitura do minuto.** Rótulo "Linha do tempo" (estilo `LABEL` de `match-view.tsx`). "Minuto" com `M:00` em `font-display`. Dois blocos: "Ritmo de ouro (últimos 3 min)" / "Ritmo de XP (últimos 3 min)" com um traço da cor da série, o valor em destaque + "por min", e embaixo "GPM até aqui: N" / "XPM até aqui: N". Números com `Intl.NumberFormat("pt-BR")`. "Fechados até aqui" + ícones dos itens grandes com `time <= minute * 60`; nenhum → "nenhum item grande ainda".
- [ ] **Step 2: Faixa de ícones.** Um `<button>` por item grande, posicionado no horário da compra, em duas fileiras por `markerRows` (distância mínima 36 px). Apagado (`opacity`) quando ainda não fechado no minuto escolhido. `aria-label`: "<nome> fechado aos M:SS". Foco/mouse: caixa com "<nome> · M:SS · <custo> de ouro" e "Ritmo de ouro: X antes → Y três minutos depois" (`beforeAfter`). Clique: `onMinuteChange(Math.round(time / 60))`. Ícone sem imagem → a sigla do nome num selo (nunca imagem quebrada); imagens com `loading="lazy"`.
- [ ] **Step 3: Gráfico.** Um `<svg>` com a curva do ritmo (linha 2 px + área a ~13% de opacidade), linhas de grade e rótulos do eixo por `axisMax`, minutos de 5 em 5, linha pontilhada em cada item grande, cursor (linha + ponto) no minuto escolhido. Botão segmentado **Ouro | XP** (`aria-pressed`) troca a série; o título acima diz "Ritmo de ouro por minuto" / "Ritmo de XP por minuto". Largura medida com `ResizeObserver` (redesenha ao redimensionar). Arrastar no gráfico (`pointerdown`/`pointermove` com captura) chama `onMinuteChange`; passar o mouse mostra "<valor> por min · minuto M · GPM até aqui: N".
- [ ] **Step 4: Barra.** `<input type="range" min={0} max={último} step={1}>` com `aria-label="Minuto da partida"`, alinhada às margens do gráfico.
- [ ] **Step 5: Tabela.** `<details>` "Ver itens em tabela": item, horário, ritmo de ouro antes → depois. Sem itens grandes, o `<details>` não aparece.
- [ ] **Step 6: Review Focus 1.** Com `gold` de 2 pontos (partida de 1 minuto): nada de `NaN` em atributos do SVG, a barra vai de 0 a 1, sem erro no console. Garanta com uma checagem no próprio componente (divisor mínimo 1) e confira no passo de verificação da Tarefa 6.
- [ ] **Step 7:** `npx tsc --noEmit`, `npm run lint`. (Sem commit: o componente só aparece na tela na Tarefa 6.)

---

### Task 6: Convite, pedido, acompanhamento e encaixe no painel

**Files:**
- Create: `components/match-timeline-gate.tsx`
- Modify: `components/match-view.tsx`

**Interfaces:**
- Consumes: `MatchTimeline` (T5); `POST`/`GET /match/<id>/parse` (T4); `TimelineState`, `defaultMinute`, `clampMinute` (T1).
- Produces: `MatchTimelineGate({ matchId, state }: { matchId: number; state: "login" | "unparsed" })`.

- [ ] **Step 1: `MatchTimelineGate`** (cliente). Textos exatos do spec:
  - `state="login"`: "Linha do tempo: veja como o herói evoluiu minuto a minuto e quanto cada item acelerou o farm." + `<a href="/auth/steam">Entrar com a Steam</a>` (`<a>`, não `<Link>`). Nenhuma chamada.
  - `state="unparsed"`: ao montar, `POST`. Pelo `status`: `requested`/`pending` → "Analisando o replay desta partida… Costuma levar menos de um minuto. A linha do tempo aparece aqui sozinha." e começa a consultar o `GET` a cada 8 s, no máximo 12 vezes; `ready` → `router.refresh()`; `too_old` → "Linha do tempo indisponível: o replay desta partida não existe mais."; `limit` → "Muitas análises pedidas hoje. Tente de novo amanhã."; `failed`/`unavailable`/`unknown`/erro de rede → "Não foi possível analisar esta partida."
  - Consulta: `ready` → `router.refresh()`; `failed`/`unknown` → "Não foi possível analisar esta partida."; 12 consultas sem desfecho → "A análise ainda não terminou. Volte daqui a pouco: quando ficar pronta, a linha do tempo aparece aqui."
  - **Review Focus 5:** resposta 401 em qualquer chamada → para de consultar e mostra o convite de login.
  - Ao desmontar: cancela o temporizador e o pedido em andamento (`AbortController`). Região com `role="status"`.
- [ ] **Step 2: `MatchView`.** Estado `minute: number | null` (null = ainda não mexeu). Para o herói selecionado com `timeline`: `último = timeline.gold.length − 1`; minuto efetivo = `clampMinute(minute ?? defaultMinute(timeline.big, último), último)`. **Trocar de herói não zera `minute`.** No painel do herói, entre o `<dl>` dos números e as listas de itens:
  - `timelineState === "ready"` e o jogador tem `timeline` → `<MatchTimeline>`;
  - `"ready"` e o jogador sem `timeline` → "Sem dados minuto a minuto para este jogador.";
  - `"login"` / `"unparsed"` → `<MatchTimelineGate>`, montado **uma vez por página** (não remonta ao trocar de herói: senão cada troca faria um `POST`).
- [ ] **Step 3: Conferir** em `npm run build && npx next start`, no Chrome:
  - deslogado, `/match/9070527945?player=321580662`: convite com o botão; nenhuma chamada a `/parse` na aba de rede;
  - logado (sessão do Alex no `localhost`), mesma partida: linha do tempo; minuto 16 → ouro 785, GPM 523, XP 1.019, XPM 516; ícone da Battle Fury aos 12:36 com "400 antes → 790 três minutos depois"; clicar nele leva ao minuto 13; arrastar no gráfico e na barra; ↑↓/←→ na barra; botão XP troca a curva; trocar de herói mantém o minuto;
  - logado, uma partida recente do Alex **não processada**: "Analisando o replay…" e a linha do tempo aparece sozinha; no banco, `parse_requested_at` preenchido e `parse_job_id` nulo no fim; recarregar não gera outro `[OpenDota] POST` no log;
  - 390 px (iframe): sem rolagem lateral; os ícones não saem da faixa;
  - partida processada recarregada 3 vezes: nenhum `[OpenDota] GET` no log;
  - console sem erros.
- [ ] **Step 4:** `npm test`, `npm run lint`. Commit `feat(v2.2): linha do tempo do herói no painel da partida`.

---

### Task 7: Fechamento da versão

**Files:**
- Modify: `package.json` (`2.2.0`), `CHANGELOG.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Verificação completa.** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` — todos limpos.
- [ ] **Step 2: Tempo** em `next start`, 5 medições aquecidas de `/match/<id>?player=<id>` (deslogado e logado, partida processada): igual à v2.1 (~0,1–0,4 s). Se piorou, conferir que `getViewerAccountId()` sai em paralelo e o tamanho do detalhe salvo.
- [ ] **Step 3: Critérios "Pronto quando" do spec**, um a um (1 a 8). Para o 3 (partida antiga) e o 7 (teto em 0), usar uma partida de mais de 14 dias e baixar `PARSE_DAILY_LIMIT` localmente só para o teste. `get_advisors` de novo.
- [ ] **Step 4: Documentos.**
  - `CHANGELOG.md`: entrada `[2.2.0]` (Adicionado / Técnico), no estilo da `[2.1.0]`.
  - `README.md`: versão atual; linha da v2.2 na tabela; roteiro: **v2.2 linha do tempo** (feita), **v2.3 quem joga comigo**, **v2.4 diário**; na v3, tirar "pedido automático de processamento" do que falta.
  - `CLAUDE.md` do repo: `lib/timeline.ts`, `lib/match-parse.ts`, rota `/match/[id]/parse`, colunas novas e seus estados, `DETAIL_VERSION` 4 e a regra "processado = para sempre", linha do tempo só para logados (dados não enviados a deslogados), teto e idade.
  - Nota do Obsidian `10 - Projetos\dota-own-coach.md`.
- [ ] **Step 5:** Commit `chore(v2.2): versão 2.2.0, CHANGELOG, README e CLAUDE.md`.
- [ ] **Step 6: Revisão final do branch** por um subagente novo (fluxo do Alex): diff `main..v2.2` contra o spec, com atenção ao Review Focus e a: rota de processamento sem login ou com ID forjado, formas de estourar o limite da OpenDota (repetição, corrida, teto), dados da linha do tempo chegando a deslogados, e segredo no cliente. Corrigir o que for confirmado.
- [ ] **Step 7: Entrega — parar e pedir ao Alex:**
  1. ok para `git push origin v2.2` (preview) e conferência dele;
  2. ok para merge na `main`, tag `v2.2.0` e push (= produção).
