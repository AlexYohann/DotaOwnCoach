# v2.3 Quem joga comigo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (execução direta, como o Alex aceitou) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** seção "Quem joga com {nome}" na página do jogador, com parceiros de `/players/{id}/peers` guardados no Supabase e renovados em segundo plano.

**Architecture:** regras puras em `lib/peers.ts`; chamada na borda em `lib/opendota.ts`; tabela `player_peers` + função SQL de reserva; `lib/peers-data.ts` (server-only) lê o estado e renova; rota `GET /player/[id]/peers` dispara a renovação em `after()`; componente cliente pergunta a cada 8 s.

**Tech Stack:** Next 16 (App Router, `cacheComponents`), Supabase (RLS, RPC), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-v2-3-quem-joga-comigo-design.md`

## Global Constraints

- Chamadas à OpenDota só no servidor e só em `lib/opendota.ts`.
- Tabela nova com RLS e políticas explícitas, explicadas na migração; função SQL de escrita **sem** execução para `anon`/`authenticated`.
- A página do jogador **nunca** chama `/peers` nem dispara renovação; só a rota faz isso.
- Números: `with_games ≥ 3`; até 60 guardados; recente = `last_played` ≤ 90 dias; pronto = `fetched_at` < 12 h; em andamento = `refresh_started_at` < 2 min; falha recente = `refresh_failed_at` < 10 min; tempo máximo de `getPeers` = 60 s; rota `maxDuration = 90`; polling 8 s × 12.
- Textos em português; lado/resultado nunca com cores fora de `win`/`loss` para V/D.
- `npm test`, `npx tsc --noEmit`, `npm run lint` limpos a cada commit.

## Review Focus

1. Duas abas (ou duas pessoas) abrindo a mesma conta vencida → uma única chamada à OpenDota (reserva atômica no SQL). Teste: segunda `refreshPeers` com reserva negada não chama `getPeers`.
2. OpenDota devolve `[]` para uma conta que tinha parceiros → não apaga a lista boa (marca falha). Teste em `peers-data`.
3. Conta que ainda não está em `players` (primeira visita, gravação em `after()` pendente) → rota responde `unknown` sem chamar nada; o cliente tenta de novo uma vez após 3 s. Teste em `peers-data`.
4. Entradas estranhas da OpenDota (sem `account_id`, números negativos/não numéricos, avatar `http:`) → descartadas/limpas na borda. Teste em `opendota.test.ts`.
5. Sem `SUPABASE_SECRET_KEY` → `refreshPeers` devolve `"failed"` sem chamar a OpenDota (senão cada pergunta do cliente faria uma chamada de 45 s). Teste em `peers-data`.

---

### Task 1: Regras puras (`lib/peers.ts`) + rótulo "há X" comum

**Files:** Create `lib/peers.ts`, `tests/peers.test.ts`. Modify `lib/pros.ts` (extrair `agoLabel`), `tests/pros.test.ts` (casos de `agoLabel`).

**Interfaces — Produces:**
```ts
export type Peer = { account_id: number; name: string | null; avatar: string | null;
  with_games: number; with_win: number; against_games: number; against_win: number;
  last_played: number /* unix s */ };
export type PeersRow = { peers: Peer[] | null; fetched_at: string | null;
  refresh_started_at: string | null; refresh_failed_at: string | null };
export type PeersState = "ready" | "refreshing" | "failed" | "start";
export type PeersSnapshot = { state: PeersState | "unknown"; peers: Peer[] | null; fetchedAt: string | null };
export const PEERS_MIN_GAMES = 3, PEERS_MAX = 60, PEERS_RECENT_DAYS = 90;
export const PEERS_TTL_MS = 12 h, PEERS_RUNNING_MS = 2 min, PEERS_RETRY_MS = 10 min;
export function selectPeers(raw: Peer[]): Peer[];
export function splitPeers(peers: Peer[], nowMs: number): { recent: Peer[]; old: Peer[] };
export function peersState(row: PeersRow | null, nowMs: number): PeersState;
export function winPercent(win: number, games: number): number | null; // inteiro 0–100, null se games = 0
// lib/pros.ts
export function agoLabel(thenMs: number, nowMs: number): string; // "hoje" | "ontem" | "há N dias" | "há N mês/meses" | "há mais de um ano"
```

- [ ] Testes (`tests/peers.test.ts`): `selectPeers` tira `with_games` 2, ordena 10 > 5 > 3, empate → maior `last_played` primeiro, corta em 60; `splitPeers` com 89 e 91 dias; `peersState`: null → start; fetched há 11 h → ready; fetched há 13 h + started há 1 min → refreshing; started há 3 min → start; failed há 5 min → failed; failed há 11 min → start; fetched fresco vence started; `winPercent(2,3)` = 67, `(0,0)` = null. `tests/pros.test.ts`: `agoLabel` hoje/ontem/11 dias/1 mês/3 meses/mais de um ano; `lastPlayedLabel` continua igual.
- [ ] Rodar `npx vitest run tests/peers.test.ts tests/pros.test.ts` → falha.
- [ ] Implementar; `lastPlayedLabel` passa a ser `"jogou " + agoLabel(...)`.
- [ ] Rodar → passa. Commit `feat(v2.3): regras dos parceiros (lib/peers.ts)`.

### Task 2: `getPeers` na borda (`lib/opendota.ts`)

**Interfaces — Consumes:** `Peer` (Task 1). **Produces:** `export async function getPeers(accountId: number): Promise<Peer[]>` — `GET /players/{id}/peers`, tempo máximo 60 s; corpo que não é lista (ou 404) → `OpenDotaError("unavailable")`; entradas inválidas puladas; `name` = `personaname` como texto ou null; `avatar` = `avatarfull`/`avatar` só se `https://`; números inteiros ≥ 0; `account_id` repetido pulado.

- [ ] Testes em `tests/opendota.test.ts` (fetch falso): mapeia uma entrada real; pula sem `account_id`, com `with_games` "x" ou -1; avatar `http:` → null; 404 → lança `OpenDotaError`; objeto em vez de lista → lança.
- [ ] Falha → implementar → passa. Commit `feat(v2.3): getPeers na OpenDota`.

### Task 3: Tabela, reserva e `lib/peers-data.ts`

**Files:** Create `supabase/migrations/20261115000000_v2_3_player_peers.sql`, `lib/peers-data.ts`, `tests/peers-data.test.ts`.

**SQL:** tabela como no spec; `create function public.claim_peers_refresh(p_account_id bigint, p_ttl_s int, p_running_s int, p_retry_s int) returns boolean language sql security definer set search_path = ''` — `insert … on conflict do nothing` + `update … set refresh_started_at = now() where account_id = p and (fetched_at is null or fetched_at < now() - ttl) and (refresh_started_at is null or < now() - running) and (refresh_failed_at is null or < now() - retry) returning true`; `revoke execute … from public, anon, authenticated; grant … to service_role`. Aplicar com `apply_migration`, depois `get_advisors` (security).

**Interfaces — Consumes:** Tasks 1–2. **Produces:**
```ts
export async function getPeersSnapshot(accountId: number, nowMs?: number): Promise<PeersSnapshot>; // nunca lança; erro do banco → state "start"
export async function refreshPeers(accountId: number): Promise<"saved" | "busy" | "failed">;
```
`getPeersSnapshot` lê `players` com `player_peers(...)` embutido (uma consulta); sem linha em `players` → `unknown`. `refreshPeers`: sem admin → failed; `rpc("claim_peers_refresh")` false → busy; `getPeers`; lista vazia com lista salva não vazia → marca falha; sucesso → `update {peers: selectPeers(raw), fetched_at, refresh_started_at: null}`; erro → `update {refresh_failed_at, refresh_started_at: null}`.

- [ ] Testes (Supabase/OpenDota falsos, como `match-parse.test.ts`): snapshot ready/unknown/erro→start; refresh salva só os ≥ 3; busy não chama `getPeers`; sem admin não chama; erro marca `refresh_failed_at`; `[]` sobre lista boa → failed e lista intacta.
- [ ] Falha → implementar → passa → aplicar migração + advisors. Commit `feat(v2.3): tabela player_peers e renovação em segundo plano`.

### Task 4: Rota, seção e página

**Files:** Create `app/player/[id]/peers/route.ts`, `components/player-peers.tsx`. Modify `app/player/[id]/page.tsx`.

- Rota `GET`: `toAccountId` inválido → 400 `{state:"unknown"}`; `getPeersSnapshot`; `start` → `after(() => refreshPeers(id))` e responde `refreshing`; `no-store`; `maxDuration = 90`.
- Página: `getPeersSnapshot(accountId)` no `Promise.all` existente; `<PlayerPeers accountId name initial nowMs />` entre o banner e a tabela (`unknown` da página vira `start`).
- Componente: estados e textos do spec; grade 1/2/3 colunas; `ProAvatar` 40 px; nome é `<Link prefetch={false} href="/player/<id>">`; "Parceiros antigos (N)" em `<details>`; polling 8 s × 12; `unknown` → nova tentativa após 3 s, depois aviso de falha.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` (a rota tem que sair dinâmica: `ƒ`).
- [ ] `next start` + Chrome: conta com lista salva (aparece direto), conta sem lista (busca e aparece sozinha, ou aviso se a OpenDota estiver fora), 390 px, tempo da página igual ao de antes. Commit `feat(v2.3): seção "Quem joga com" na página do jogador`.

### Task 5: Fechamento

- [ ] `package.json` 2.3.0, `CHANGELOG.md`, README (roteiro), `CLAUDE.md` (seção v2.3), nota do Obsidian.
- [ ] Revisão final do branch por subagente; corrigir achados com teste.
- [ ] Commit `chore(v2.3): versão 2.3.0`. **Não** fazer merge/push sem o ok do Alex.
