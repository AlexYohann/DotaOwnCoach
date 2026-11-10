# v2.0 — Login com a Steam: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** login só pela Steam (OpenID 2.0) com sessão do Supabase. Logado, `/` leva às próprias partidas. Cabeçalho com perfil, menu e busca por ID. Cartão do herói mais jogado com médias. Template de e-mail removido.

**Architecture:** a validação da Steam é uma função pura (`lib/steam-openid.ts`) com `fetch` injetável. A sessão é criada pelo servidor com a secret key (`createUser` + `generateLink`) e aberta nos cookies com `verifyOtp` num Route Handler. O `account_id` vai em `app_metadata` e chega no JWT, o que permite ao `proxy.ts` e ao cabeçalho lê-lo com `getClaims()` sem consultar o banco. As regras de rota viram uma função pura (`lib/auth-routing.ts`), testada e usada pelo proxy.

**Tech Stack:** Next 16 (App Router, `cacheComponents`), `@supabase/ssr` + `@supabase/supabase-js`, Tailwind v3 + shadcn/ui (`dropdown-menu` já instalado), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-v2-0-login-steam-design.md`. Ler inteiro antes de começar. Os §§ citados abaixo são dele.

## Global Constraints

- Tudo num branch `v2.0` criado a partir da `main`. **Push e merge só com pergunta ao Alex** (push na `main` = produção).
- `npm test` antes de cada commit. Mensagens de commit em português. Terminar cada commit com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nunca usar `SUPABASE_SECRET_KEY` em `NEXT_PUBLIC_` ou em código do cliente. Arquivos que usam a secret key começam com `import "server-only"`.
- Um cliente Supabase por request/função, nunca em variável de módulo. No `updateSession`, nada entre `createServerClient` e `getClaims()`. Todo redirect do proxy copia os cookies do `supabaseResponse`.
- `account_id` só em `app_metadata`, nunca em `user_metadata`.
- Usuários Steam **sem senha**. O e-mail interno usa um domínio que ninguém recebe (definido na Task 1).
- `cacheComponents`: tudo que lê cookie/sessão fica dentro de `<Suspense>`.
- O cabeçalho **não chama a OpenDota**. Nome e avatar vêm da tabela `players`.
- Textos da interface em português, sem jargão. Lado (Radiant/Dire) sempre em texto neutro.
- Toda tabela nova com RLS. Migração em `supabase/migrations/`, aplicada pelo MCP `apply_migration`, seguida de `get_advisors` (security).
- Shadcn gerado pelo CLI vem em Tailwind v4: converter para v3 e usar `cn` de `@/lib/utils` (ver `CLAUDE.md`).
- O tempo é medido em `npm run build && npx next start`, nunca no dev.

## Review Focus

1. **Callback reaberto** (voltar no navegador ou recarregar `/auth/steam/callback?...`): a mesma resposta não pode logar de novo. A pessoa vê `/auth/error` com "tente entrar de novo", não um erro 500. Dono: Task 4 (verificação manual), mais o replay apurado na Task 1.
2. **Steam fora do ar ou lenta na `check_authentication`:** recusa em até 8 s, sem travar. Dono: Task 3 (teste `falha de rede/timeout recusa`).
3. **Conta Steam que a OpenDota não conhece** (perfil privado ou nunca jogou): o cabeçalho mostra "Conta <id>" com avatar neutro, sem quebrar. Dono: Task 6 (teste `toHeaderAccount sem linha em players`).
4. **Sessão sem `account_id` nas claims** (JWT antigo ou usuário criado por fora): em `/` não redireciona e não entra em loop. Dono: Task 5 (teste `logado sem account_id em / não redireciona`).
5. **Celular a 390 px:** o cabeçalho, com busca e perfil, não estica a largura da página. Dono: Task 6 (verificação no navegador a 390 px).

---

### Task 1: Base de tempo + protótipo da sessão (descartável)

Responde as perguntas do spec §3 antes de escrever o código de verdade. **Nada do protótipo é commitado**, exceto a atualização do spec.

**Files:**
- Create (temporários, apagar no fim): `app/auth/spike/route.ts`, `app/auth/spike/callback/route.ts`
- Modify: `docs/superpowers/specs/2026-11-10-v2-0-login-steam-design.md` (nova subseção "Resultado do protótipo" no §3)

- [ ] **Step 1: Criar o branch:** `git switch -c v2.0`.
- [ ] **Step 2: Medir a base de tempo** (critério 7) antes de qualquer mudança.

  Rodar `npm run build && npx next start` e fazer 10 requisições a `http://localhost:3000/player/105248644`, depois de uma primeira para aquecer. Anotar a mediana (formato `curl -s -o NUL -w "%{time_total}\n"`) num comentário temporário do plano ou na nota. Parar o servidor pelo PID, conferindo a linha de comando: TaskStop deixa o `next start` órfão.
- [ ] **Step 3: Protótipo de `/auth/spike`.** O GET redireciona para a Steam com `return_to = <origem>/auth/spike/callback`. O callback:
  1. loga todos os `openid.*`;
  2. chama `check_authentication` **duas vezes** e loga as duas respostas;
  3. tenta `admin.auth.admin.createUser({ email: "<steamid64>@steam.invalid", email_confirm: true, app_metadata: { steam_id64, account_id } })`. Se o domínio for recusado, tenta outro e anota;
  4. chama `generateLink({ type: "magiclink", email })`;
  5. chama `verifyOtp({ type: "email", token_hash })` com o cliente de `lib/supabase/server.ts`;
  6. chama `getClaims()` e loga `claims.app_metadata`.
- [ ] **Step 4: Pedir ao Alex** para abrir `http://localhost:3000/auth/spike` (com `npm run dev`) e entrar com a Steam.

  Registrar:
  - (a) domínio aceito;
  - (b) se a sessão ficou nos cookies (recarregar outra página e ver `getClaims()` com usuário);
  - (c) se `account_id` aparece nas claims;
  - (d) se a 2ª `check_authentication` deu `is_valid:false`;
  - (e) o `type` de `verifyOtp` que funcionou.
- [ ] **Step 5: Testar o cadastro desligado.** Pedir ao Alex para desligar "Allow new users to sign up" (Supabase → Authentication → Sign In / Providers). Repetir o login do protótipo com o usuário já apagado e confirmar que `createUser` (admin) ainda funciona.

  Testar também, nessa configuração, se `generateLink` + `verifyOtp` continuam funcionando com o provedor Email **desligado**. Anotar o resultado e religar o que for preciso.
- [ ] **Step 6: Se algum passo falhar**, testar a alternativa (ex.: `type: "magiclink"` em `verifyOtp`; outro domínio) e registrar o caminho escolhido e o porquê.
- [ ] **Step 7: Limpar.** Apagar `app/auth/spike*` e os usuários de teste (`delete from auth.users where email like '%@<domínio>'`, conferindo antes com `select`).
- [ ] **Step 8: Escrever "Resultado do protótipo" no spec §3:**
  - domínio escolhido (vira `STEAM_EMAIL_DOMAIN`);
  - `type` do `verifyOtp`;
  - replay: Steam recusa ou não. Se **não** recusar, a Task 3 ganha o passo de nonce, descrito no próprio spec;
  - estado final do painel (cadastro desligado; provedor Email ligado/desligado);
  - a mediana da base de tempo.
- [ ] **Step 9: Commit** só do spec: `git commit -m "docs(v2.0): resultado do protótipo da sessão Steam"`.

---

### Task 2: Tabela `profiles` com RLS

**Files:**
- Create: `supabase/migrations/20261110000000_v2_0_profiles.sql`

**Interfaces:**
- Produces: tabela `public.profiles (id uuid PK → auth.users on delete cascade, account_id bigint not null unique, steam_id64 text not null unique, created_at timestamptz default now(), last_login timestamptz default now())`, exatamente como no spec §4.

- [ ] **Step 1: Escrever a migração** com o SQL do spec §4, mais:
  - `alter table public.profiles enable row level security;`
  - política `"profiles: dono lê a própria linha"` `for select to authenticated using ((select auth.uid()) = id)`;
  - nenhuma política de escrita;
  - comentários em português explicando cada política, no estilo de `20261107000000_v1_3_cache.sql`.
- [ ] **Step 2: Aplicar** com `apply_migration` (name `v2_0_profiles`) e rodar `get_advisors` (security). Esperado: nenhum alerta novo sobre `profiles`.
- [ ] **Step 3: Conferir o RLS por SQL** (critério 6), numa transação com `rollback`:
  1. `set local role anon; select count(*) from public.profiles;` → 0 linhas visíveis, sem erro;
  2. com `set local role authenticated` e `set local request.jwt.claims = '{"sub":"<uuid qualquer>"}'`, inserir → erro 42501.
- [ ] **Step 4: Commit:** `git commit -m "v2.0: tabela profiles (RLS: dono lê, só o servidor grava)"`.

---

### Task 3: Validação da resposta da Steam

**Files:**
- Create: `lib/steam-openid.ts`
- Test: `tests/steam-openid.test.ts`

**Interfaces:**
- Produces:
  - `STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login"`
  - `STEAM_CALLBACK_PATH = "/auth/steam/callback"`
  - `buildSteamLoginUrl(origin: string): string`
  - `verifySteamResponse(params: URLSearchParams, origin: string, fetchFn?: typeof fetch): Promise<string | null>`: devolve o **SteamID64** (17 dígitos) ou `null`. Nunca lança.

- [ ] **Step 1: Escrever os testes**, com `ORIGIN = "http://localhost:3000"` e uma resposta válida montada por helper `validParams(overrides)`:
  - `op_endpoint = STEAM_OPENID_ENDPOINT`;
  - `claimed_id = identity = "https://steamcommunity.com/openid/id/76561198065514372"`;
  - `return_to = ORIGIN + STEAM_CALLBACK_PATH`;
  - `mode = "id_res"`, mais `response_nonce`, `assoc_handle`, `signed` e `sig` fictícios.

  Os testes:
  - `buildSteamLoginUrl monta checkid_setup com return_to e realm da origem`: a URL começa com `STEAM_OPENID_ENDPOINT + "?"`, e os parâmetros são `openid.mode=checkid_setup`, `openid.ns=http://specs.openid.net/auth/2.0`, `openid.return_to=ORIGIN+STEAM_CALLBACK_PATH`, `openid.realm=ORIGIN`, `openid.identity` e `openid.claimed_id` = `http://specs.openid.net/auth/2.0/identifier_select`;
  - `resposta válida e confirmada pela Steam devolve o SteamID64`: `fetchFn` devolve `"ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"` → `"76561198065514372"`. Conferir que `fetchFn` recebeu `POST` em `STEAM_OPENID_ENDPOINT`, com corpo form-urlencoded contendo `openid.mode=check_authentication` e o mesmo `openid.sig`;
  - `it.each` de rejeições **locais**, cada uma devolvendo `null` **sem chamar** `fetchFn`:
    - `mode` `cancel`;
    - `mode` ausente;
    - `op_endpoint` `https://evil.example/openid/login`;
    - `return_to` `https://evil.example/auth/steam/callback`;
    - `return_to` `ORIGIN + "/auth/steam/callback-x"`;
    - `claimed_id` `https://steamcommunity.com/openid/id/123`;
    - `claimed_id` `https://evil.example/openid/id/76561198065514372`;
    - `identity` diferente de `claimed_id`;
  - `return_to com query string no mesmo caminho é aceito`: `ORIGIN + STEAM_CALLBACK_PATH + "?x=1"` → SteamID64;
  - `Steam responde is_valid:false recusa` → `null`;
  - `resposta da Steam sem is_valid recusa` (`"ok"`) → `null`;
  - `HTTP 500 da Steam recusa` → `null`;
  - `falha de rede/timeout recusa`: `fetchFn` rejeita com `new DOMException("timeout", "TimeoutError")` → `null`.
- [ ] **Step 2: Rodar** `npx vitest run tests/steam-openid.test.ts`. Esperado: FAIL (módulo não existe).
- [ ] **Step 3: Implementar** `lib/steam-openid.ts` (`import "server-only"`). Regras de validação exatamente como no spec §2:
  - o `return_to` é comparado por `new URL(...)`: `origin` e `pathname` iguais aos nossos;
  - o `claimed_id` casa com `^https://steamcommunity\.com/openid/id/(\d{17})$`;
  - a `check_authentication` usa `signal: AbortSignal.timeout(8000)` e exige a linha `is_valid:true`;
  - qualquer exceção vira `null`.
- [ ] **Step 4: Se a Task 1 mostrou que a Steam NÃO recusa o replay:**
  - adicionar `verifySteamResponse(..., now?: () => number)`, recusando `openid.response_nonce` com mais de 5 min. Teste: `nonce de 10 min atrás recusa`;
  - registrar nonces usados numa tabela `used_nonces (nonce text primary key, used_at timestamptz)`, com RLS ligado e **sem nenhuma política** (só a secret key acessa). O teste usa uma função injetada `markNonceUsed(nonce): Promise<boolean>` (false = já usado): `nonce repetido recusa`.

  Se a Steam recusa, pular este passo.
- [ ] **Step 5: Rodar** `npm test`. Esperado: PASS, com todos os anteriores.
- [ ] **Step 6: Commit:** `git commit -m "v2.0: validação da resposta OpenID da Steam"`.

---

### Task 4: Criar a sessão e as rotas do login

**Files:**
- Create: `lib/steam-session.ts`, `app/auth/steam/route.ts`, `app/auth/steam/callback/route.ts`
- Modify: `app/auth/error/page.tsx` (visual do site + português)
- Test: `tests/steam-session.test.ts`

**Interfaces:**
- Consumes: `buildSteamLoginUrl`, `verifySteamResponse` (Task 3); `toAccountId` (`lib/steam.ts`); `createAdminClient` (`lib/supabase/admin.ts`); `createClient` (`lib/supabase/server.ts`).
- Produces:
  - `STEAM_EMAIL_DOMAIN` (valor da Task 1);
  - `steamEmail(steamId64: string): string` → `` `${steamId64}@${STEAM_EMAIL_DOMAIN}` ``;
  - `prepareSteamSession(admin: SupabaseClient, steamId64: string): Promise<{ userId: string; accountId: number; tokenHash: string }>`: lança `Error` em qualquer falha;
  - os códigos de erro de `/auth/error?reason=` são `steam` (validação falhou) e `session` (Supabase falhou). Cancelar na Steam não é erro: volta para `/`.

- [ ] **Step 1: Escrever os testes** de `prepareSteamSession` com um admin falso que registra as chamadas (estilo de `tests/data.test.ts`):
  - `usuário novo: cria com app_metadata e sem senha, gera o link e grava profiles`:
    - `createUser` recebeu `{ email: steamEmail(id), email_confirm: true, app_metadata: { steam_id64: id, account_id: 105248644 } }`, **sem** `password` e **sem** `user_metadata`;
    - `generateLink` recebeu `{ type: "magiclink", email }`;
    - houve upsert em `profiles` com `{ id: <user.id do generateLink>, account_id: 105248644, steam_id64: id, last_login: <string ISO> }`;
    - o retorno é `{ userId, accountId: 105248644, tokenHash }`;
  - `usuário já existe (email_exists): segue para o link e atualiza last_login`;
  - `outro erro no createUser lança`;
  - `generateLink sem hashed_token lança`;
  - `erro ao gravar profiles lança`;
  - `SteamID64 que não vira account_id lança` (`"76561197960265728"`).
- [ ] **Step 2: Rodar** `npx vitest run tests/steam-session.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** `lib/steam-session.ts` (`server-only`). O erro "já existe" é identificado por `error.code === "email_exists"`. Se a Task 1 mostrou outro código, usar o observado.
- [ ] **Step 4: Rodar** `npm test`. Esperado: PASS.
- [ ] **Step 5: Rotas:**
  - `app/auth/steam/route.ts`: o `GET` redireciona para `buildSteamLoginUrl(request.nextUrl.origin)`.
  - `app/auth/steam/callback/route.ts`, na ordem:
    1. `openid.mode === "cancel"` → redirect `/`;
    2. `verifySteamResponse` com `null` → `/auth/error?reason=steam`;
    3. `createAdminClient()` com `null` → `/auth/error?reason=session`;
    4. `prepareSteamSession`;
    5. `createClient()` + `verifyOtp({ type: <da Task 1>, token_hash })`, com erro → `/auth/error?reason=session`;
    6. redirect `/player/<accountId>`.
  - Erros de Supabase ou Steam são logados com `console.error` sem o token.
- [ ] **Step 6: `app/auth/error/page.tsx`:** `PageShell` (o slot `account` entra na Task 6) + `StatusMessage`. Mensagens:
  - `steam`: "Não conseguimos confirmar seu login com a Steam. Tente entrar de novo.";
  - `session`: "O login com a Steam deu certo, mas não conseguimos abrir sua sessão agora. Tente de novo em alguns minutos.";
  - qualquer outro: "Algo deu errado no login. Tente entrar de novo.";
  - botão "Entrar com a Steam" (`<a href="/auth/steam">`).
- [ ] **Step 7: Verificação manual** (`npm run dev`, Alex entra com a Steam):
  - cai em `/player/<id>` logado;
  - **recarregar a URL do callback** cai em `/auth/error?reason=steam` (ou `session`) com a mensagem, sem 500 (Review Focus 1);
  - cancelar na Steam volta para `/`;
  - `select id, account_id from profiles` mostra 1 linha;
  - entrar de novo não duplica.
- [ ] **Step 8: Commit:** `git commit -m "v2.0: entrar com a Steam (sessão do Supabase criada pelo servidor)"`.

---

### Task 5: Regras de rota no proxy

**Files:**
- Create: `lib/auth-routing.ts`
- Modify: `lib/supabase/proxy.ts`, `lib/utils.ts` (remover `hasEnvVars`)
- Test: `tests/auth-routing.test.ts`

**Interfaces:**
- Produces (módulo puro, sem `server-only`, usado também pelo cabeçalho):
  - `accountIdFromClaims(claims: unknown): number | null`: lê `claims.app_metadata.account_id`. Aceita só inteiro entre 1 e 4294967295;
  - `routeFor(pathname: string, loggedIn: boolean, accountId: number | null): string | null`: caminho para onde redirecionar, ou `null`.

- [ ] **Step 1: Escrever os testes:**
  - `accountIdFromClaims`:
    - `{ app_metadata: { account_id: 105248644 } }` → 105248644;
    - `null`, `{}`, `{ app_metadata: {} }`, `account_id: "105248644"` (string), `0`, `1.5`, `4294967296` → `null`;
    - `{ user_metadata: { account_id: 1 } }` → `null` (**user_metadata é ignorado**).
  - `routeFor`:
    - `logado com account_id em / vai para /player/<id>`;
    - `logado sem account_id em / não redireciona` (Review Focus 4);
    - `logado em /player/1 não redireciona`;
    - `deslogado em /, /player/1, /match/2, /auth/steam, /auth/steam/callback, /auth/error não redireciona`;
    - `deslogado em /protected e /qualquer redireciona para /`;
    - `deslogado em /login redireciona para /` (prefixo removido).
- [ ] **Step 2: Rodar** `npx vitest run tests/auth-routing.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** `lib/auth-routing.ts`. Rotas públicas: `/` exato e os prefixos `/auth`, `/player`, `/match`.
- [ ] **Step 4: Proxy.** Em `updateSession`:
  - remover o desvio `hasEnvVars`;
  - depois de `getClaims()`, calcular `routeFor(pathname, !!claims, accountIdFromClaims(claims))`;
  - se não for `null`, criar `NextResponse.redirect(url)` e copiar `supabaseResponse.cookies.getAll()` para ele antes de devolver;
  - remover `hasEnvVars` de `lib/utils.ts` e de quem o importa.
- [ ] **Step 5: Rodar** `npm test` e `npx tsc --noEmit`. Esperado: PASS e sem erros.
- [ ] **Step 6: Verificação manual:**
  - logado, abrir `/` vai para as próprias partidas;
  - deslogado, `/protected` vai para `/`;
  - `/player/105248644` abre deslogado.
- [ ] **Step 7: Commit:** `git commit -m "v2.0: proxy manda o usuário logado para as próprias partidas"`.

---

### Task 6: Cabeçalho com perfil, menu e busca

**Files:**
- Create: `lib/account.ts`, `components/header-account.tsx` (servidor), `components/account-menu.tsx` (cliente), `components/header-search.tsx` (cliente)
- Modify:
  - `components/site-header.tsx`, `components/page-shell.tsx`;
  - `app/page.tsx`, `app/player/[id]/page.tsx`, `app/match/[id]/page.tsx`, `components/match-view.tsx`, `app/auth/error/page.tsx`;
  - `components/logout-button.tsx` (vira item do menu: `signOut` → `router.push("/")` + `router.refresh()`).
- Test: `tests/account.test.ts`

**Interfaces:**
- Consumes: `accountIdFromClaims` (Task 5); `createClient` (server); `createReadClient`.
- Produces:
  - `type HeaderAccount = { accountId: number; name: string; avatar: string | null }`;
  - `toHeaderAccount(accountId: number, row: { personaname: string | null; avatar: string | null } | null): HeaderAccount` (puro, exportado de `lib/account.ts`);
  - `getHeaderAccount(): Promise<HeaderAccount | null>` (`server-only`): claims → `account_id` → linha de `players`. Sem sessão ou sem `account_id` → `null`. Erro de banco → `toHeaderAccount(id, null)`;
  - `SiteHeader({ right, account }: { right?: React.ReactNode; account: React.ReactNode })`: `account` obrigatório, para o TypeScript acusar a página que esquecer;
  - `HeaderAccountSlot()`: componente de servidor que devolve `<Suspense fallback={<placeholder do mesmo tamanho>}>` com o conteúdo dentro. Deslogado: `<a href="/auth/steam">Entrar com a Steam</a>`, que é `<a>` e não `Link`, para não pré-carregar o redirect externo. Logado: `<AccountMenu account={...} />`;
  - `PageShell({ right, account, children })`.

- [ ] **Step 1: Escrever os testes** de `toHeaderAccount`:
  - `com linha em players usa nome e avatar`;
  - `sem linha em players: "Conta <id>" e avatar null` (Review Focus 3);
  - `personaname null usa "Conta <id>" e mantém o avatar`.
- [ ] **Step 2: Rodar** e ver FAIL. **Implementar** `lib/account.ts`. **Rodar** e ver PASS.
- [ ] **Step 3: Componentes.** Ordem do cabeçalho: marca · `right` (link contextual, ex.: "← Voltar ao histórico") · `HeaderSearch` · `account`.
  - **Busca:** formulário com `aria-label="Buscar jogador"` e placeholder "Código de amigo ou SteamID64". Faz `router.push("/player/" + encodeURIComponent(valor.trim()))` e ignora valor vazio. Não valida: quem valida é a página.
  - **Menu** (shadcn `dropdown-menu`):
    - topo informativo "Conectado pela Steam" com nome e ID;
    - "Minhas partidas" → `/player/<accountId>`;
    - "Sair" em `text-loss`.
  - **Avatar:** `next/image` se houver; senão um círculo neutro com a inicial.
  - Na v2.1, a busca vai sugerir pros: manter o input e o submit separados, para dar para pendurar sugestões depois.
  - Deixar o layout preparado para dois itens futuros entre a marca e a busca: o link "Pro players" (v2.1) e o seletor de idioma. Só o espaço no flex, sem elemento falso nem item vazio clicável (spec §5).
- [ ] **Step 4: Ligar as páginas.**
  - Todas passam `account={<HeaderAccountSlot />}`. Na partida, `MatchContent` passa o nó para `MatchView` (nova prop `account: React.ReactNode`).
  - O link "Buscar outro ID" (`NEW_SEARCH`) sai da página do jogador. O "← Nova busca" da partida sem `?player=` continua.
  - A home troca o texto "Entrar com a Steam (em breve)" pelo `HeaderAccountSlot`.
- [ ] **Step 5: Rodar** `npm test`, `npx tsc --noEmit` e `npm run build`. Esperado: tudo passa. O build falha se algo ler cookie fora de `Suspense`.
- [ ] **Step 6: Verificação no navegador** (`next start`):
  - deslogado vê "Entrar com a Steam";
  - logado vê avatar e nome;
  - "Minhas partidas" e "Sair" funcionam. Sair volta para `/` deslogado, e o botão de entrar reaparece;
  - a busca leva a `/player/<id>`;
  - **largura de 390 px** em `/`, `/player/<id>` e `/match/<id>`, sem rolagem horizontal da página (Review Focus 5). Decidir aqui como a busca encolhe.
- [ ] **Step 7: Commit:** `git commit -m "v2.0: cabeçalho com perfil, menu e busca por ID"`.

---

### Task 7: Médias no cartão do herói mais jogado

**Files:**
- Modify: `lib/player-summary.ts`, `app/player/[id]/page.tsx` (`MostPlayedCard`)
- Test: `tests/player-summary.test.ts`

**Interfaces:**
- Produces:
  - `type HeroAverages = { kills: number; deaths: number; assists: number; kda: number; winRate: number | null; gpm: number; xpm: number; lastHits: number }`. Valores brutos, sem arredondar. `winRate` é uma fração entre 0 e 1;
  - `MostPlayed` ganha `avg: HeroAverages`;
  - `formatDecimal(value: number, digits: 0 | 1): string`: `Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })`.

- [ ] **Step 1: Ajustar os testes.**
  - Os existentes passam de `toEqual` para `toMatchObject` nos campos antigos.
  - O helper `m()` ganha um parâmetro opcional `stats: Partial<RecentMatch>`.
  - Novos testes:
    - `médias do herói mais jogado`: herói 99 com `(k,d,a,gpm,xpm,lh)` = `(10,2,5,500,600,100)` e `(4,0,8,300,400,50)`, os dois vitória, mais uma partida do herói 46. Esperado `avg = { kills: 7, deaths: 1, assists: 6.5, kda: 13.5, winRate: 1, gpm: 400, xpm: 500, lastHits: 75 }`;
    - `KDA sem nenhuma morte divide por 1`: `(4,0,8)` sozinho → `kda: 12`;
    - `winRate null quando nenhuma partida tem resultado`;
    - `winRate ignora partida sem resultado`: 1V + 1 indefinida → `winRate: 1`;
    - `formatDecimal`: `(7.25, 1)` → `"7,3"`, `(6.5, 1)` → `"6,5"`, `(412.4, 0)` → `"412"`.
- [ ] **Step 2: Rodar** e ver FAIL. **Implementar.** **Rodar** `npm test` e ver PASS.
- [ ] **Step 3: Cartão** (mockup A em `.superpowers/brainstorm/3720-1794331432/content/pos-login.html`).
  - Grade 3 × 2 com:
    - K/D/A (`formatDecimal(_,1)` nos três);
    - KDA (1 casa);
    - Vitórias (`Math.round(winRate*100)%` ou "—");
    - GPM, XPM e Last hits (0 casas).
  - Rótulos em `text-muted-foreground`, valores em `text-ink`. O texto atual "N de 20 · xV yD" continua.
  - Conferir no navegador num jogador qualquer, deslogado.
- [ ] **Step 4: Commit:** `git commit -m "v2.0: médias do herói mais jogado no cartão"`.

---

### Task 8: Limpeza do template, painel do Supabase e documentação

**Files:**
- Delete:
  - `app/auth/{login,sign-up,sign-up-success,forgot-password,update-password,confirm}/`, `app/protected/`;
  - `components/{login,sign-up,forgot-password,update-password}-form.tsx`, `components/auth-button.tsx`;
  - `components/tutorial/`, `components/{hero,deploy-button,env-var-warning,next-logo,supabase-logo}.tsx`.
- Modify: `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `package.json` (`"version": "2.0.0"`)

- [ ] **Step 1: Antes de apagar cada arquivo,** procurar o nome dele em `app/`, `components/` e `lib/` (Grep). Só apagar o que não tiver importador fora da lista acima.
- [ ] **Step 2: Rodar** `npm run lint`, `npx tsc --noEmit`, `npm test` e `npm run build`. Esperado: todos passam (critério 9).
- [ ] **Step 3: Painel (Alex).** Passar a lista exata, conforme a Task 1:
  - "Allow new users to sign up" desligado;
  - provedor Email no estado decidido.

  Depois, conferir o critério 8 com um script descartável fora do repo, usando a chave pública:
  - `signUp({ email: "teste-x@<domínio>", password: "x".repeat(12) })` → erro de cadastro desligado;
  - `signInWithPassword({ email: steamEmail(<id do Alex>), password: "qualquer" })` → erro.

  Anotar a saída.
- [ ] **Step 4: Documentação.**
  - `README.md`:
    - roteiro com v2.0 = login com a Steam (marcar quando lançar), v2.1 = pro players, v2.2 = diário (o conteúdo atual da v2), depois idioma;
    - ideia futura "histórico além de 20 partidas / por herói";
    - em "Versões lançadas", a v2.0.
  - `CLAUDE.md`:
    - reescrever "Auth architecture" e a parte de proteção de rotas para o fluxo Steam: `lib/steam-openid.ts`, `lib/steam-session.ts`, `lib/auth-routing.ts`, `account_id` em `app_metadata`, domínio interno, painel;
    - remover o parágrafo "Template leftovers";
    - atualizar a lista de features.
  - `CHANGELOG.md`: entrada 2.0.0.
- [ ] **Step 5: Commit:** `git commit -m "v2.0.0: remove o login por e-mail do template e documenta o login com a Steam"`.

---

### Task 9: Verificação final, preview e lançamento

- [ ] **Step 1: Medir o tempo** de `/player/105248644` em `next start`, deslogado e logado (cookie de sessão copiado do navegador para o `curl -b`), com o mesmo método da Task 1. Esperado: mediana a ±50 ms da base (critério 7).
- [ ] **Step 2: Revisão de segurança do branch.** Procurar `SUPABASE_SECRET_KEY` e `createAdminClient` e confirmar que só aparecem em arquivos `server-only`. Conferir que nenhum `user_metadata` é lido para decidir `account_id`.
- [ ] **Step 3: Perguntar ao Alex** e fazer `git push -u origin v2.0`. Ele confere se as env vars da Vercel estão marcadas para "Preview" e testa o login com a Steam na URL de preview (critério 0).
- [ ] **Step 4: Perguntar ao Alex** e fazer o merge na `main` (`git merge --no-ff v2.0`) e `git push`. Depois, conferir em produção os critérios 1, 2 e 3.
- [ ] **Step 5: Tag** `git tag -a v2.0.0 -m "v2.0.0: login com a Steam"` + `git push origin v2.0.0` (com pergunta). Apagar o branch `v2.0` local e remoto.
- [ ] **Step 6: Atualizar** a nota do Obsidian (`10 - Projetos\dota-own-coach.md`) e a memória `project_dota-own-coach.md` com o estado da v2.0.0, as decisões do protótipo e as pendências.
