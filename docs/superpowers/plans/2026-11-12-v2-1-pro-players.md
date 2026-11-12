# v2.1 Pro players — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buscar pro players pelo nick (tolerando erro de digitação), página `/pros` com times em destaque, "Ver um exemplo" na capa, link do perfil na Steam, explicação do rating e menu do avatar ampliado.

**Architecture:** A lista de pros e times da OpenDota é copiada para três tabelas novas no Supabase, renovada por um cron diário da Vercel (com a visita a `/pros` como rede de segurança e uma trava de 10 minutos). A busca é uma rota do servidor que chama uma função SQL com `pg_trgm`; o componente de busca do cabeçalho vira um combobox que só chama o servidor quando a pessoa digita. Regras puras ficam em `lib/pros.ts` (testadas), o acesso a dados em `lib/pros-data.ts` (`server-only`).

**Tech Stack:** Next.js 16 (App Router, `cacheComponents: true`), Supabase (Postgres + `pg_trgm`, `@supabase/supabase-js`), Tailwind v3, shadcn/ui, Vitest, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-11-12-v2-1-pro-players-design.md` — leia antes de qualquer tarefa.

## Global Constraints

- OpenDota só no servidor e só em `lib/opendota.ts`. Páginas e rotas chamam `lib/data.ts` / `lib/pros-data.ts`.
- Gravações disparadas por uma página rodam dentro de `after()`. A rota do cron grava dentro da resposta.
- Tabela nova com RLS e políticas explicadas em comentário na migração. Migração aplicada pelo MCP (`apply_migration`), arquivo `.sql` em `supabase/migrations/` como fonte, `get_advisors` (security) depois.
- Nenhum segredo em `NEXT_PUBLIC_` nem em código do cliente. `CRON_SECRET` e `SUPABASE_SECRET_KEY` só no servidor.
- `cacheComponents: true`: o que lê cookie/params/dados de request fica dentro de `<Suspense>`.
- `npx shadcn add` gera Tailwind v4: importar `cn` de `@/lib/utils`, desinstalar o pacote npm `cn` se vier, converter `origin-(--x)` → `origin-[--x]`.
- Tema só escuro; cores `panel`, `line`, `ink`, `ember`, `win`, `loss`; títulos `font-display`. Dentro de `overflow-x-auto`, o contêiner leva `relative`.
- Textos da interface em português. Explicar ao Alex o que mudou e por quê, em português.
- `npm test` antes de cada commit. Commits no branch `v2.1`. **Nenhum push sem ok do Alex** (push na `main` = produção).
- Valores do spec: validade 1 dia; trava 10 minutos; 6 times; atividade nos últimos 60 dias; exemplo com partida nos últimos 30 dias; busca com 2 a 32 caracteres, 5 resultados por grupo, espera de ~150 ms; `maxDuration` 60 s.

## Review Focus

1. **A OpenDota devolve lista vazia ou minúscula** (falha parcial com HTTP 200): a renovação não pode apagar os dados bons. Esperado: recusa gravar. → Tarefa 4.
2. **Uma das 6 chamadas de elenco falha no meio da renovação**: nada é apagado, `completed_at` não muda, a próxima tentativa refaz. → Tarefa 4.
3. **Registros estranhos em `/proPlayers`** (`name` nulo ou vazio, `account_id` ausente, nick só de símbolos): são pulados, sem derrubar a renovação. → Tarefas 1 e 2.
4. **Busca só com símbolos, espaços ou `%`/`_`** (`"%%"`, `"  "`, `"-"`): resposta vazia sem ir ao banco. → Tarefas 1 e 5.
5. **Brasão com URL `http://` ou imagem que não carrega**: aparece a sigla, sem ícone quebrado nem aviso de conteúdo misto. → Tarefas 1 e 6.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/pros.ts` (novo) | Regras puras: normalização, validação da busca, times em destaque, elenco, sorteio, "jogou há X", URL segura do brasão, destino do Enter |
| `lib/steam.ts` | + `steamProfileUrl` |
| `lib/opendota.ts` | + `getProPlayers`, `getTeams`, `getTeamPlayers` |
| `lib/pros-data.ts` (novo, `server-only`) | Leitura/gravação das tabelas de pros, trava, renovação, busca, exemplo |
| `lib/cron-auth.ts` (novo, `server-only`) | Confere o `Authorization` do cron |
| `lib/match-tip.ts` (novo) | Preferência "dica dispensada" |
| `supabase/migrations/20261112000000_v2_1_pros.sql` (novo) | Tabelas, RLS, `pg_trgm`, `search_pros` |
| `app/pros/page.tsx`, `app/pros/search/route.ts`, `app/pros/refresh/route.ts`, `app/pros/example/route.ts` (novos) | Página e rotas |
| `components/header-search.tsx` | Vira combobox com o dropdown B; tamanhos `sm`/`lg` |
| `components/pro-suggestion-row.tsx`, `components/team-crest.tsx`, `components/rating-help.tsx`, `components/match-tip.tsx` (novos) | Peças visuais |
| `components/site-header.tsx`, `page-shell.tsx`, `account-menu.tsx`, `hero-banner.tsx`, `match-view.tsx`, `app/page.tsx`, `app/player/[id]/page.tsx` | Mudanças pontuais |

---

### Task 1: Regras puras (`lib/pros.ts`, `lib/steam.ts`, `lib/match-tip.ts`)

**Files:**
- Create: `lib/pros.ts`, `lib/match-tip.ts`, `tests/pros.test.ts`, `tests/match-tip.test.ts`
- Modify: `lib/steam.ts`, `tests/steam.test.ts`

**Interfaces — Produces:**

```ts
// lib/pros.ts (sem "server-only": o componente de busca também usa)
export type ProSuggestion = {
  accountId: number; name: string; avatar: string | null;
  teamName: string | null; teamTag: string | null; teamLogo: string | null;
  lastMatchTime: string | null; // ISO
  verified: boolean;
};
export type ProSearchResult = { verified: ProSuggestion[]; others: ProSuggestion[] };
export type TeamLike = { team_id: number; rating: number; last_match_time: number | null }; // segundos Unix
export type MemberLike = { account_id: number; name: string | null; games_played: number; is_current_team_member: boolean | null };

export const FEATURED_TEAMS = 6;
export function normalizeNick(text: string): string;
export function cleanQuery(raw: string | null): string | null; // null = não buscar
export function featuredTeams<T extends TeamLike>(teams: T[], nowMs: number): T[];
export function currentRoster(members: MemberLike[]): { account_id: number; name: string }[];
export function pickExample(candidates: number[], random: () => number): number | null;
export function lastPlayedLabel(iso: string | null, nowMs: number): string;
export function safeLogoUrl(url: string | null | undefined): string | null;
export function submitTarget(value: string, highlighted: ProSuggestion | null, first: ProSuggestion | null): string | null;

// lib/steam.ts
export function steamProfileUrl(accountId: number): string;

// lib/match-tip.ts (mesmo estilo de readHeroMotion/saveHeroMotion em lib/hero-art.ts)
export function readTipDismissed(storage: Pick<Storage, "getItem"> | null): boolean;
export function saveTipDismissed(storage: Pick<Storage, "setItem"> | null): void; // chave "dota-own-coach:match-tip", valor "dismissed"
```

- [ ] **Step 1: Escrever os testes (falhando)** em `tests/pros.test.ts`, `tests/match-tip.test.ts` e `tests/steam.test.ts`, com estas afirmações:

```ts
// normalizeNick
expect(normalizeNick("Miracle-")).toBe("miracle");
expect(normalizeNick("No[o]ne-")).toBe("noone");
expect(normalizeNick("Sákura")).toBe("sakura");
expect(normalizeNick("天鸽")).toBe("天鸽");
expect(normalizeNick("ряф^^")).toBe("ряф");
expect(normalizeNick("-_- ")).toBe("");

// cleanQuery
expect(cleanQuery("Yat")).toBe("yat");
expect(cleanQuery(" y ")).toBeNull();          // menos de 2 úteis
expect(cleanQuery("%%")).toBeNull();
expect(cleanQuery("__")).toBeNull();
expect(cleanQuery(null)).toBeNull();
expect(cleanQuery("a".repeat(33))).toBeNull(); // mais de 32 no texto bruto
expect(cleanQuery("33")).toBe("33");           // nick numérico existe

// featuredTeams: nowMs fixo; 60 dias = 60*86400 s
// 8 times ativos + 1 de rating maior parado há 61 dias + 1 com last_match_time null
// → devolve 6, em ordem decrescente de rating, sem o parado e sem o null
// time que jogou há exatamente 59 dias entra

// currentRoster
// só is_current_team_member === true; ordenado por games_played desc;
// 6 membros atuais → devolve os 6; name null ou "" é descartado

// pickExample
expect(pickExample([], () => 0.5)).toBeNull();
expect(pickExample([10, 20, 30], () => 0)).toBe(10);
expect(pickExample([10, 20, 30], () => 0.999)).toBe(30);

// lastPlayedLabel (now = 2026-11-12T12:00:00Z)
expect(lastPlayedLabel(null, now)).toBe("sem partidas recentes");
expect(lastPlayedLabel("2026-11-12T03:00:00Z", now)).toBe("jogou hoje");
expect(lastPlayedLabel("2026-11-11T10:00:00Z", now)).toBe("jogou ontem");
expect(lastPlayedLabel("2026-11-01T12:00:00Z", now)).toBe("jogou há 11 dias");
expect(lastPlayedLabel("2026-08-12T12:00:00Z", now)).toBe("jogou há 3 meses");
expect(lastPlayedLabel("2025-01-20T12:00:00Z", now)).toBe("jogou há mais de um ano");
expect(lastPlayedLabel("lixo", now)).toBe("sem partidas recentes");

// safeLogoUrl
expect(safeLogoUrl("https://cdn.steamusercontent.com/ugc/1/A/")).toBe("https://cdn.steamusercontent.com/ugc/1/A/");
expect(safeLogoUrl("http://x.com/a.png")).toBeNull();
expect(safeLogoUrl("javascript:alert(1)")).toBeNull();
expect(safeLogoUrl(null)).toBeNull();

// submitTarget
expect(submitTarget("105248644", null, anyPro)).toBe("/player/105248644");   // só dígitos, nada escolhido → ID
expect(submitTarget("33", pro33, pro33)).toBe("/player/" + pro33.accountId); // escolhido com as setas vence
expect(submitTarget("yat", null, yatoro)).toBe("/player/321580662");         // texto → primeira sugestão
expect(submitTarget("zzzz", null, null)).toBeNull();
expect(submitTarget("  ", null, null)).toBeNull();

// steamProfileUrl
expect(steamProfileUrl(321580662)).toBe("https://steamcommunity.com/profiles/76561198281846390");

// match-tip: nada salvo → false; "dismissed" → true; storage null → false;
// getItem/setItem que lançam → false / não lança
```

"Dias" em `lastPlayedLabel` = diferença de calendário em `America/Sao_Paulo` (o mesmo fuso de `lib/match.ts`); a partir de 30 dias, meses = `floor(dias / 30)`; a partir de 365 dias, "há mais de um ano".

- [ ] **Step 2:** `npx vitest run tests/pros.test.ts tests/match-tip.test.ts tests/steam.test.ts` → FALHA (módulos/funções não existem).
- [ ] **Step 3:** Implementar. `normalizeNick`: `normalize("NFD")`, remover `\p{M}`, minúsculas, manter só `[\p{L}\p{N}]` (flag `u`). `steamProfileUrl` reaproveita `STEAM_ID64_BASE` com `BigInt`.
- [ ] **Step 4:** Mesmo comando → PASSA. `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit `feat(v2.1): regras puras dos pro players`.

---

### Task 2: Cliente da OpenDota

**Files:**
- Modify: `lib/opendota.ts`, `tests/opendota.test.ts`

**Interfaces — Produces:**

```ts
export type ProPlayer = {
  account_id: number; name: string; personaname: string | null; avatar: string | null; // = avatarmedium
  team_id: number | null;       // 0 ou ausente → null
  team_name: string | null; team_tag: string | null;   // "" → null
  verified: boolean;            // is_locked === true
  last_match_time: string | null;
};
export type ProTeam = {
  team_id: number; name: string; tag: string | null; logo_url: string | null;
  rating: number; last_match_time: number | null;
};
export type TeamMember = { account_id: number; name: string | null; games_played: number; is_current_team_member: boolean | null };

export async function getProPlayers(): Promise<ProPlayer[]>;      // GET /proPlayers
export async function getTeams(): Promise<ProTeam[]>;              // GET /teams
export async function getTeamPlayers(teamId: number): Promise<TeamMember[]>; // GET /teams/{id}/players
```

Usam o `request<T>()` existente (mesmo timeout, mesmo log `[OpenDota] GET`, mesmos `OpenDotaError`). Sem `"use cache"`: quem guarda é o banco.

- [ ] **Step 1: Testes** (no padrão de `fetchMock` do arquivo):
  - `getProPlayers` mapeia `avatarmedium` → `avatar`, `is_locked: true` → `verified: true`, `is_locked: null` → `false`, `team_id: 0` → `null`, `team_name: ""` → `null`.
  - Pula registro sem `account_id` inteiro positivo e registro com `name` nulo ou só espaços (devolve os demais).
  - Corpo que não é array (`{}`, `null`) → lança `OpenDotaError` `unavailable`.
  - `getTeams` mapeia os campos; `logo_url` ausente → `null`; pula item sem `team_id` ou sem `rating` numérico.
  - `getTeamPlayers(7119388)` chama `/teams/7119388/players`; 404 → `[]`.
  - 429 em qualquer das três → `OpenDotaError` `rate_limit`.
- [ ] **Step 2:** `npx vitest run tests/opendota.test.ts` → FALHA.
- [ ] **Step 3:** Implementar as três funções e os tipos.
- [ ] **Step 4:** → PASSA.
- [ ] **Step 5:** Commit `feat(v2.1): OpenDota — proPlayers, teams e elenco`.

---

### Task 3: Migração (tabelas, RLS, busca)

**Files:**
- Create: `supabase/migrations/20261112000000_v2_1_pros.sql`

- [ ] **Step 1: Escrever a migração**, com comentário em português explicando cada política (modelo: `20261107000000_v1_3_cache.sql`):

```sql
create extension if not exists pg_trgm with schema extensions;

create table public.pro_teams (
  team_id          bigint primary key,
  name             text        not null,
  tag              text,
  logo_url         text,
  rating           real        not null,
  last_match_time  timestamptz,
  roster           jsonb,                       -- [{account_id, name}], só nos times em destaque
  fetched_at       timestamptz not null default now()
);

create table public.pro_players (
  account_id       bigint primary key,
  name             text        not null,
  name_norm        text        not null,        -- lib/pros.ts normalizeNick
  personaname      text,
  avatar           text,
  team_id          bigint,                      -- sem FK: muitos times ficam fora dos 1.000
  team_name        text,
  team_tag         text,
  verified         boolean     not null default false,
  last_match_time  timestamptz,
  fetched_at       timestamptz not null default now()
);
create index pro_players_name_trgm on public.pro_players using gin (name_norm extensions.gin_trgm_ops);
create index pro_teams_featured on public.pro_teams (rating desc) where roster is not null;

-- uma linha só; controla a renovação
create table public.pros_refresh (
  id            boolean primary key default true check (id),
  attempted_at  timestamptz not null default 'epoch',
  completed_at  timestamptz
);
insert into public.pros_refresh default values;

alter table public.pro_teams    enable row level security;
alter table public.pro_players  enable row level security;
alter table public.pros_refresh enable row level security;

create policy "leitura pública" on public.pro_teams   for select to anon, authenticated using (true);
create policy "leitura pública" on public.pro_players for select to anon, authenticated using (true);
-- pros_refresh: NENHUMA política = ninguém lê nem grava pela chave pública; só o servidor (secret key).

create function public.search_pros(q text)
returns table (
  account_id bigint, name text, avatar text, team_name text, team_tag text,
  logo_url text, last_match_time timestamptz, verified boolean
)
language sql stable security invoker set search_path = ''
as $$
  with m as (
    select p.*,
           case when p.name_norm like q || '%' then 0
                when p.name_norm like '%' || q || '%' then 1
                else 2 end as tier,
           extensions.similarity(p.name_norm, q) as sim
    from public.pro_players p
    where p.name_norm <> ''
      and (p.name_norm like '%' || q || '%'
           or (char_length(q) >= 3 and extensions.similarity(p.name_norm, q) > 0.3))
  ), r as (
    select m.*, row_number() over (
      partition by m.verified
      order by m.tier, m.sim desc, m.last_match_time desc nulls last, m.account_id
    ) as rn
    from m
  )
  select r.account_id, r.name, r.avatar, r.team_name, r.team_tag,
         t.logo_url, r.last_match_time, r.verified
  from r left join public.pro_teams t on t.team_id = r.team_id
  where r.rn <= 5
  order by r.verified desc, r.rn;
$$;
revoke all on function public.search_pros(text) from public;
grant execute on function public.search_pros(text) to anon, authenticated;
```

`q` chega sempre normalizado (só letras e números), então não carrega `%` nem `_`. O limiar `0.3` pode ser ajustado no Step 4 da Tarefa 4.

- [ ] **Step 2:** Aplicar com o MCP `apply_migration` (nome `v2_1_pros`).
- [ ] **Step 3: Conferir** com `execute_sql`:
  - `select count(*) from public.pros_refresh;` → 1.
  - Com o papel `anon` (`set local role anon;` numa transação): `select * from public.pro_players limit 1;` funciona; `insert into public.pro_players ...` → erro 42501; `select * from public.pros_refresh;` → 0 linhas.
- [ ] **Step 4:** `get_advisors` (security) → nenhum alerta novo citando `pro_teams`, `pro_players`, `pros_refresh` ou `search_pros`. Corrigir se houver.
- [ ] **Step 5:** Commit `feat(v2.1): tabelas de pros, RLS e busca por semelhança`.

---

### Task 4: Dados (`lib/pros-data.ts`)

**Files:**
- Create: `lib/pros-data.ts`, `tests/pros-data.test.ts`

**Interfaces:**
- Consumes: `getProPlayers`, `getTeams`, `getTeamPlayers`, `OpenDotaError` (Tarefa 2); `normalizeNick`, `featuredTeams`, `currentRoster`, `pickExample`, `safeLogoUrl`, tipos `ProSuggestion`/`ProSearchResult` (Tarefa 1); `createReadClient`, `createAdminClient`.
- Produces:

```ts
import "server-only";
export type FeaturedTeam = {
  teamId: number; name: string; tag: string | null; logoUrl: string | null; rating: number;
  roster: { accountId: number; name: string; avatar: string | null; verified: boolean }[];
};
export type RefreshOutcome =
  | { status: "done"; players: number; teams: number }
  | { status: "skipped"; reason: "claimed" | "no-admin" };

/** Renova tudo. Lança (OpenDotaError ou Error) se a OpenDota falhar ou vier lista suspeita; nesse caso nada é apagado e completed_at não muda. */
export async function refreshPros(): Promise<RefreshOutcome>;
/** Times em destaque para /pros. Lança OpenDotaError se não há nada salvo e não deu para buscar. */
export async function getFeaturedTeams(): Promise<FeaturedTeam[]>;
/** q já passou por cleanQuery. Nunca lança: erro do banco → grupos vazios. */
export async function searchPros(q: string): Promise<ProSearchResult>;
/** Jogador para "Ver um exemplo"; null = sem candidato. Nunca lança. */
export async function getExampleAccountId(random?: () => number): Promise<number | null>;
/** Linha "Pro: …" da página do jogador. null se não é pro verificado ou em erro. Nunca lança. */
export async function getVerifiedPro(accountId: number): Promise<{ name: string; teamName: string | null } | null>;
```

**Regras (do spec §2):**

- Constantes: `PROS_TTL_MS` = 1 dia; `CLAIM_MS` = 10 min; `MIN_PLAYERS = 1000`; `MIN_TEAMS = 100`; lote de gravação 500; pausa de 1.100 ms entre as chamadas de elenco.
- **Trava:** `update pros_refresh set attempted_at = now where id = true and attempted_at < (now − 10 min)` com `.select()`; uma linha devolvida = reserva feita. Tudo com o cliente admin.
- **`refreshPros`:** sem admin → `skipped/no-admin`; reserva negada → `skipped/claimed`. Senão: `getProPlayers()` e `getTeams()` em paralelo; se `players.length < MIN_PLAYERS` ou `teams.length < MIN_TEAMS` → lança sem gravar. Escolhe `featuredTeams(teams, Date.now())` e busca os 6 elencos em fila com a pausa. Só depois de **todas** as chamadas darem certo grava: `pro_teams` (com `roster` nos 6 e `null` nos demais, `logo_url` por `safeLogoUrl`, `last_match_time` convertido de segundos para ISO), `pro_players` (com `name_norm`; registro cujo `name_norm` é `""` é gravado mesmo assim, a função SQL o ignora), apaga das duas tabelas as linhas com `fetched_at` anterior ao início desta execução, e por último `completed_at = now`. Erro de gravação → lança, sem apagar e sem `completed_at`.
- **`getFeaturedTeams`:** lê `pro_teams` com `roster` não nulo (ordem `rating desc`) e os `pro_players` dos `account_id` dos elencos (avatar, `verified`).
  - Há times: devolve. Se `completed_at` (lido com admin; sem admin, pula) tem mais de 1 dia ou é nulo → `after(() => refreshPros().catch(log))`.
  - Não há times: se há admin e a reserva é negada → lança `OpenDotaError("unavailable")`. Senão busca na OpenDota na hora (mesma montagem da renovação), devolve, e grava em `after()` quando há admin.
- **`getExampleAccountId`:** candidatos = `pro_players` verificados, cujo `account_id` está em algum `roster` em destaque, com `last_match_time` nos últimos 30 dias; `pickExample(candidatos, random ?? Math.random)`. Se a tabela está vazia, chama `getFeaturedTeams()` uma vez (dispara a carga inicial) e tenta de novo; qualquer erro → `null`.
- **`searchPros`:** `createReadClient().rpc("search_pros", { q })`; mapeia para `ProSuggestion` (`teamLogo` por `safeLogoUrl`) e separa por `verified`.

- [ ] **Step 1: Testes** em `tests/pros-data.test.ts`, com dublês no padrão de `tests/data.test.ts` (`after()` em fila com `flushAfter`, Supabase falso que registra gravações/remoções, `@/lib/opendota` simulado mantendo a classe `OpenDotaError`). Fábricas: `players(n)` gera `n` `ProPlayer`; `teams(n)` gera `n` `ProTeam` ativos. Casos:
  1. `refreshPros` sem admin → `{status:"skipped", reason:"no-admin"}`, nenhuma chamada à OpenDota.
  2. Reserva negada → `skipped/claimed`, nenhuma chamada à OpenDota.
  3. Caminho feliz (1.200 pros, 150 times) → `done`; `getTeamPlayers` chamado 6 vezes; `pro_teams` gravado com `roster` em exatamente 6; remoção das linhas antigas acontece **depois** das gravações; `completed_at` gravado por último.
  4. **Review Focus 1:** `getProPlayers` devolve 3 registros → lança; nenhuma gravação, nenhuma remoção, `completed_at` intacto. Idem `getTeams` com 5.
  5. **Review Focus 2:** a 4ª chamada de `getTeamPlayers` lança `OpenDotaError` → `refreshPros` lança; nenhuma gravação, nenhuma remoção.
  6. Erro na gravação de `pro_players` → lança; nenhuma remoção; `completed_at` intacto.
  7. `getFeaturedTeams` em dia → só banco, fila do `after` vazia, nenhuma chamada à OpenDota.
  8. Vencido (`completed_at` há 2 dias) → devolve o do banco e a fila do `after` tem 1 item; depois de `flushAfter`, a OpenDota foi chamada.
  9. Vazio com reserva feita → busca na OpenDota na hora, devolve 6 times, grava só depois de `flushAfter`.
  10. Vazio com reserva negada → lança `OpenDotaError` com `kind` `unavailable`.
  11. Vazio sem admin → busca na hora e não grava.
  12. `searchPros`: linhas do RPC viram os dois grupos; `logo_url` `http://…` vira `teamLogo: null`; erro do RPC → `{verified: [], others: []}`.
  13. `getExampleAccountId`: escolhe entre verificados do elenco com partida recente (random controlado); sem candidato → `null`; erro de leitura → `null`.
  14. `getVerifiedPro`: verificado → `{name, teamName}`; não verificado → `null`; erro → `null`.

  Para os testes não esperarem 1.100 ms reais: `vi.useFakeTimers()` ou injetar a pausa por parâmetro opcional interno.
- [ ] **Step 2:** `npx vitest run tests/pros-data.test.ts` → FALHA.
- [ ] **Step 3:** Implementar `lib/pros-data.ts`.
- [ ] **Step 4:** → PASSA. Depois, carga real e conferência da busca: com `.env.local` completo, rodar a renovação uma vez (script temporário fora do repo, ou a rota da Tarefa 5 quando existir) e conferir com `execute_sql`:
  - `select count(*) from pro_players;` → > 5000; `select count(*) from pro_teams where roster is not null;` → 6.
  - `select name, verified from search_pros('yat');` → primeira linha `Yatoro`, `verified = true`.
  - `select name, verified from search_pros('yatorro');` → contém `Yatoro` verificado.
  - `select name from search_pros('miracle');` → contém `Miracle-`.
  - Se algum falhar, ajustar o limiar/ordem na migração (nova migração de correção) e repetir.
- [ ] **Step 5:** `npm test` inteiro verde. Commit `feat(v2.1): dados dos pros — renovação com trava, destaque, busca, exemplo`.

---

### Task 5: Rotas (`/pros/search`, `/pros/refresh`, `/pros/example`) e rota pública

**Files:**
- Create: `lib/cron-auth.ts`, `app/pros/search/route.ts`, `app/pros/refresh/route.ts`, `app/pros/example/route.ts`, `tests/cron-auth.test.ts`
- Modify: `lib/auth-routing.ts` (`PUBLIC_PREFIXES` + `"/pros"`), `tests/auth-routing.test.ts`, `vercel.json`, `.env.example`

**Interfaces:**
- Consumes: `cleanQuery` (T1); `searchPros`, `refreshPros`, `getExampleAccountId` (T4).
- Produces: `isCronAuthorized(header: string | null, secret: string | undefined): boolean`; `GET /pros/search?q=` → JSON `ProSearchResult`.

- [ ] **Step 1: Testes.**

```ts
// tests/cron-auth.test.ts
expect(isCronAuthorized("Bearer s3cr3t-long", "s3cr3t-long")).toBe(true);
expect(isCronAuthorized("Bearer errado", "s3cr3t-long")).toBe(false);
expect(isCronAuthorized("s3cr3t-long", "s3cr3t-long")).toBe(false);      // sem "Bearer "
expect(isCronAuthorized(null, "s3cr3t-long")).toBe(false);
expect(isCronAuthorized("Bearer ", "")).toBe(false);                      // segredo não configurado nunca autoriza
expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);

// tests/auth-routing.test.ts (deslogado)
expect(routeFor("/pros", false, null)).toBeNull();
expect(routeFor("/pros/search", false, null)).toBeNull();
expect(routeFor("/pros/example", false, null)).toBeNull();
expect(routeFor("/prosx", false, null)).toBe("/");
```

- [ ] **Step 2:** `npx vitest run tests/cron-auth.test.ts tests/auth-routing.test.ts` → FALHA.
- [ ] **Step 3: Implementar.**
  - `isCronAuthorized`: compara em tempo constante (`crypto.timingSafeEqual` sobre SHA-256 dos dois lados, para tamanhos diferentes não lançarem).
  - `app/pros/search/route.ts`: `GET(request: NextRequest)`; `cleanQuery(searchParams.get("q"))`; `null` → `{verified: [], others: []}` sem chamar `searchPros` (**Review Focus 4**); senão `searchPros(q)`. Cabeçalho `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
  - `app/pros/refresh/route.ts`: `export const maxDuration = 60;` `GET`: não autorizado → 401 `{error: "unauthorized"}` sem tocar em nada; senão `refreshPros()` e responde o `RefreshOutcome` (200); exceção → 502 `{error: "refresh_failed"}` com `console.error`. `Cache-Control: no-store`.
  - `app/pros/example/route.ts`: `GET` → `getExampleAccountId()`; redireciona (307) para `/player/<id>` ou, sem candidato, `/pros`. `Cache-Control: no-store`. O destino usa `request.nextUrl.clone()` (mesma origem), nunca um parâmetro vindo de fora.
  - `vercel.json`: acrescentar `"crons": [{ "path": "/pros/refresh", "schedule": "0 9 * * *" }]` (09:00 UTC = 06:00 em Brasília).
  - `.env.example`: bloco `CRON_SECRET=` com comentário: só servidor, valor aleatório longo, a Vercel envia `Authorization: Bearer <valor>` nos crons.
- [ ] **Step 4:** Testes → PASSA. Conferir em `npm run build && npx next start` (com `CRON_SECRET=teste-local` no `.env.local`):
  - `curl -i localhost:3000/pros/refresh` → 401.
  - `curl -i -H "Authorization: Bearer teste-local" localhost:3000/pros/refresh` → 200 `{"status":"done",…}` (ou `skipped/claimed` se rodou há menos de 10 min).
  - `curl "localhost:3000/pros/search?q=yatorro"` → `verified[0].name` = `Yatoro`.
  - `curl "localhost:3000/pros/search?q=%25%25"` → grupos vazios e nenhuma linha de banco no log.
  - `curl -i localhost:3000/pros/example` → 307 para `/player/<número>`.
- [ ] **Step 5:** `npm test`. Commit `feat(v2.1): rotas de busca, renovação diária (cron) e exemplo`.

---

### Task 6: Busca com sugestões (dropdown B) e cabeçalho

**Files:**
- Create: `components/pro-suggestion-row.tsx`, `components/team-crest.tsx`
- Modify: `components/header-search.tsx`, `components/site-header.tsx`, `components/page-shell.tsx`

**Interfaces:**
- Consumes: `ProSuggestion`, `ProSearchResult`, `lastPlayedLabel`, `submitTarget`, `normalizeNick` (T1); `GET /pros/search` (T5).
- Produces:
  - `HeaderSearch({ size = "sm" }: { size?: "sm" | "lg" })` — `lg` é a busca grande de `/pros`.
  - `TeamCrest({ logo, tag, size }: { logo: string | null; tag: string | null; size: number })` — `<img>` do brasão; sem `logo` ou em `onError` mostra a sigla (`tag`) num selo de texto; sem os dois, nada (**Review Focus 5**).
  - `SiteHeader({ right, account, search = true })` e `PageShell({ right, account, search, children })`; `SiteHeader` mostra o link `Pro players` (`<Link href="/pros">`) sempre, inclusive no celular.

Referência visual: `.superpowers/brainstorm/2919-1794454402/content/busca-dropdown.html`, cartão B.

- [ ] **Step 1: Implementar `TeamCrest` e `ProSuggestionRow`.** Linha verificada: avatar 40 px, nick + selo ✓ (círculo `bg-ember`), segunda linha `Time · jogou há X`, brasão 32 px. Linha comum: avatar 32 px, mesma segunda linha, sigla. Sem time → só "jogou há X". O trecho digitado aparece em `text-ember` quando o nick o contém literalmente (comparação sem maiúsculas); se o casamento foi só por semelhança, sem destaque. Imagens: `<img loading="lazy" referrerPolicy="no-referrer">` com `// eslint-disable-next-line @next/next/no-img-element`.
- [ ] **Step 2: Reescrever `HeaderSearch`.**
  - `inputMode="numeric"` sai; placeholder e `aria-label`: "Nome do pro ou ID da Steam".
  - A cada mudança: espera 150 ms, `fetch("/pros/search?q=" + encodeURIComponent(valor))` com `AbortController`; resposta de pedido antigo é descartada; menos de 2 caracteres não chama o servidor e fecha a lista. Falha de rede → lista fechada, sem mensagem.
  - Grupos "Profissionais verificados" e "Outros jogadores com esse nome" (título só aparece se o grupo tem itens). Sem resultado para texto: "Nenhum pro com esse nome. Para outros jogadores, use o ID."
  - Rodapé da lista: "↑ ↓ escolher · Enter abrir · número = busca por ID" (escondido no celular).
  - Teclado e ARIA no padrão combobox: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; lista `role="listbox"`, itens `role="option"`. ↑/↓ percorrem os dois grupos em sequência; Esc fecha; clique fora fecha; Enter usa `submitTarget(valor, destacado, primeiro)` e navega com `router.push`; `null` → nada acontece.
  - Clique numa sugestão navega para `/player/<accountId>`.
  - `size="lg"`: campo de 50 px de altura, borda `ember`, largura até 560 px; a lista acompanha a largura do campo. No celular a lista ocupa a largura do campo e não estica a página.
- [ ] **Step 3:** `SiteHeader`: link "Pro players" antes do grupo `right`; `search={false}` não renderiza a caixa. `PageShell` repassa `search`.
- [ ] **Step 4: Conferir** em `npm run build && npx next start`, no navegador, em `/player/<id>`:
  - digitar `yat` → Yatoro (Team Spirit) no grupo de verificados, homônimos abaixo;
  - `yatorro` → Yatoro aparece; Enter abre `/player/321580662`;
  - `105248644` + Enter → `/player/105248644`;
  - `zzzzzz` → mensagem de "Nenhum pro";
  - ↑ ↓ Esc funcionam; em 390 px de largura nada vaza para o lado;
  - na aba de rede, carregar a página **não** faz pedido a `/pros/search`.
- [ ] **Step 5:** `npm test`, `npm run lint`. Commit `feat(v2.1): busca por nick com sugestões no cabeçalho`.

---

### Task 7: Página `/pros` e explicação do rating

**Files:**
- Create: `app/pros/page.tsx`, `components/rating-help.tsx`, `components/ui/popover.tsx` (via shadcn)

**Interfaces:**
- Consumes: `getFeaturedTeams`, `FeaturedTeam` (T4); `HeaderSearch size="lg"`, `TeamCrest`, `PageShell search={false}` (T6); `OpenDotaErrorMessage`.

Referência visual: `.superpowers/brainstorm/2919-1794454402/content/capa-e-pros.html`, tela 2.

- [ ] **Step 1:** `npx shadcn@latest add popover`; aplicar as conversões das Global Constraints; `npm run build` passa.
- [ ] **Step 2: `RatingHelp`** (cliente): botão redondo "?" com `aria-label="Como funciona o rating"`, abre um `Popover` (clique/toque; fecha tocando fora ou com Esc) com exatamente este texto:

  > **Rating** — pontuação calculada pela OpenDota no sistema Elo, o mesmo do xadrez. Todo time começa em 1000. A cada partida entre dois times registrados, o vencedor ganha pontos e o perdedor perde os mesmos pontos; vencer um time mais forte vale mais. Não é um ranking oficial da Valve.

- [ ] **Step 3: `app/pros/page.tsx`.** `metadata.title` "Pro players". Estrutura como a página do jogador: `<main>` + `<Suspense>` com fallback em `PageShell` ("Carregando os times…"). Conteúdo: `h1` "Partidas dos pro players" ("pro players" em `text-ember`), parágrafo "Procure pelo nick. Não precisa saber o time nem acertar a grafia.", `<HeaderSearch size="lg" />`, título "Times em destaque" + `<RatingHelp />`, subtítulo "Os mais bem colocados que jogaram nos últimos 60 dias. Clique num jogador para ver as partidas.", grade `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Cartão: `TeamCrest` 38 px, nome em `font-display`, `rating <inteiro>`, e **todos** os jogadores do `roster`, cada um `<Link href="/player/<accountId>">` com avatar 22 px (`<img>`; sem avatar, quadrado com a inicial), nick e selo ✓ se verificado. Erro de `getFeaturedTeams` → `OpenDotaErrorMessage` (a busca continua visível acima). Cabeçalho com `search={false}`.
- [ ] **Step 4: Conferir** em `next start`: `/pros` mostra 6 times com elenco inteiro; recarregar 3 vezes não gera `[OpenDota] GET` no log; "?" abre e fecha por clique e por toque (emulação de celular); 390 px sem rolagem lateral; deslogado, `/pros` não redireciona.
- [ ] **Step 5:** `npm test`, `npm run lint`. Commit `feat(v2.1): página /pros com times em destaque e explicação do rating`.

---

### Task 8: Capa, dica da partida e página do jogador

**Files:**
- Create: `components/match-tip.tsx`
- Modify: `app/page.tsx`, `components/match-view.tsx`, `app/player/[id]/page.tsx`

**Interfaces:**
- Consumes: `readTipDismissed`, `saveTipDismissed`, `steamProfileUrl` (T1); `getVerifiedPro` (T4).

- [ ] **Step 1: Capa** (`app/page.tsx`): abaixo de `<SteamIdForm />`, bloco com borda superior `border-line`: rótulo "Ainda sem o seu ID?" (caixa alta, pequeno, `text-muted-foreground`) e dois botões de contorno: `<a href="/pros/example">Ver um exemplo →</a>` (**`<a>`, não `<Link>`**) e `<Link href="/pros">Partidas dos <span className="text-ember">pro players</span> →</Link>`. A página continua estática: `npm run build` deve listar `/` como estática como hoje.
- [ ] **Step 2: `MatchTip`** (cliente): começa oculta, aparece no `useEffect` se `readTipDismissed(storage)` for `false`. Texto: "Clique num herói para ver os detalhes. Passe o mouse num item para ver o que ele faz." Botão "×" com `aria-label="Dispensar dica"` chama `saveTipDismissed` e some. Acesso ao `localStorage` protegido como em `browserStorage()` de `components/hero-banner.tsx`. Inserir em `MatchView` logo acima das tabelas dos times.
- [ ] **Step 3: Página do jogador.**
  - `getVerifiedPro(accountId)` entra no `Promise.all` existente (ela nunca lança).
  - Se veio um pro: abaixo do `h1`, linha `Pro: <nome> ✓ · <time>` (selo igual ao da busca; sem time, sem o trecho " · …").
  - Na linha de detalhes (`accountId · últimas N partidas · …`), acrescentar o link `Perfil na Steam ↗` → `steamProfileUrl(accountId)`, `target="_blank"`, `rel="noopener noreferrer"`. Aparece para qualquer jogador.
- [ ] **Step 4: Conferir** em `next start`: capa com os dois botões; "Ver um exemplo" 5 vezes → sempre um jogador com partidas; `/player/321580662` mostra "Pro: Yatoro ✓ · Team Spirit" e o link abre o perfil certo na Steam; `/player/134658652` (homônimo não verificado) **não** mostra a linha "Pro:"; dica aparece na partida, some no "×" e não volta ao recarregar.
- [ ] **Step 5:** `npm test`, `npm run lint`. Commit `feat(v2.1): exemplo na capa, dica da partida, perfil na Steam e identidade de pro`.

---

### Task 9: Menu do avatar

**Files:**
- Modify: `components/account-menu.tsx`, `components/hero-banner.tsx`, `lib/hero-art.ts`, `tests/hero-motion.test.ts`

**Interfaces:**
- Consumes: `steamProfileUrl` (T1); `readHeroMotion`, `saveHeroMotion`.
- Produces: `export const HERO_MOTION_EVENT = "dota-own-coach:hero-motion"` em `lib/hero-art.ts`.

- [ ] **Step 1:** Teste: `expect(HERO_MOTION_EVENT).toBe("dota-own-coach:hero-motion")` → FALHA → exportar → PASSA.
- [ ] **Step 2: `HeroBanner`:** depois de `saveHeroMotion`, `window.dispatchEvent(new Event(HERO_MOTION_EVENT))`; um `useEffect` escuta o evento e relê a preferência (o herói obedece na hora quando a troca vem do menu).
- [ ] **Step 3: `AccountMenu`**, nesta ordem:
  1. Avatar maior + nome + "Conectado pela Steam".
  2. "Código de amigo" + número + botão copiar (`navigator.clipboard.writeText(String(accountId))` em `try/catch`; sucesso → o rótulo vira "Copiado" por 2 s; falha ou API ausente → nada quebra). O clique não fecha o menu (`onSelect` com `preventDefault`).
  3. `Minhas partidas` · `Meu perfil na Steam ↗` (`<a target="_blank" rel="noopener noreferrer">`) · `Pro players` (`<Link href="/pros">`).
  4. `Animação dos heróis` com o estado à direita ("ligada"/"desligada"); alterna com `saveHeroMotion` + o evento; lê o estado ao abrir e escuta o evento; não fecha o menu.
  5. `Sair`: `signOut({ scope: "local" })`, depois `window.location.assign("/")` como hoje.
- [ ] **Step 4: Conferir** em `next start`, logado: copiar cola o número certo; alternar a animação no menu para/retoma o herói sem recarregar, e o botão de pausa do banner reflete o mesmo estado; "Sair" volta à capa; com duas sessões (dois navegadores), sair de uma **não** derruba a outra.
- [ ] **Step 5:** `npm test`, `npm run lint`. Commit `feat(v2.1): menu do avatar — código de amigo, Steam, pros, animação, sair só deste aparelho`.

---

### Task 10: Fechamento da versão

**Files:**
- Modify: `package.json` (`2.1.0`), `CHANGELOG.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Verificação completa.** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` — todos limpos.
- [ ] **Step 2: Tempo** em `npm run build && npx next start`, 5 medições aquecidas de cada: `/player/<id>`, `/match/<id>?player=<id>`, `/pros`. `/player` e `/match` iguais à v2.0 (~0,1–0,4 s; a v2.0 mediu `/player` em ~0,08 s do banco); `/pros` na mesma faixa. Se `/player` piorou por causa de `getVerifiedPro`, conferir que ela sai em paralelo.
- [ ] **Step 3: Critérios "Pronto quando" do spec**, um a um (1, 2, 3, 4, 5, 6; o 2b fica para depois do deploy). `get_advisors` de novo.
- [ ] **Step 4: Documentos.**
  - `CHANGELOG.md`: entrada `[2.1.0]` (Adicionado / Alterado / Técnico), no estilo da `[2.0.0]`.
  - `README.md`: versão atual; marcar a v2.1; renumerar o roteiro: **v2.2 "Quem joga comigo"** (`/players/{id}/peers`), **v2.3 diário** (backup do banco passa a ser pré-requisito da v2.3).
  - `CLAUDE.md` do repo: rotas `/pros*`, `lib/pros.ts`, `lib/pros-data.ts`, tabelas novas e RLS, `CRON_SECRET`, cron em `vercel.json`, `HERO_MOTION_EVENT`, logout com escopo local, `/pros` em `PUBLIC_PREFIXES`.
  - Nota do Obsidian `10 - Projetos\dota-own-coach.md`.
- [ ] **Step 5:** Commit `chore(v2.1): versão 2.1.0, CHANGELOG, README e CLAUDE.md`.
- [ ] **Step 6: Revisão final do branch** por um subagente novo (fluxo que o Alex usa): diff `main..v2.1` contra o spec, com atenção ao Review Focus e a: rota do cron sem segredo, `search_pros` chamável por `anon`, redirect do exemplo, e nenhum segredo no cliente. Corrigir o que for confirmado.
- [ ] **Step 7: Entrega — parar e pedir ao Alex:**
  1. criar `CRON_SECRET` na Vercel (Production; valor aleatório longo);
  2. ok para `git push origin v2.1` (preview) e conferência dele;
  3. ok para merge na `main`, tag `v2.1.0` e push (= produção);
  4. no dia seguinte, conferir o critério 2b (`completed_at` mudou sozinho).
