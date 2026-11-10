# v2.0 — Login com a Steam: design

Data: 2026-11-10 · Status: **aprovado pelo Alex no brainstorm** (escopo e telas). Mockups de referência (não versionados): `.superpowers/brainstorm/3720-1794331432/content/pos-login.html` (cartão escolhido: **A**).

## Por quê

O roteiro original da v2 era "login + diário". O Alex decidiu (2026-11-10) dividir:

| Versão | Conteúdo |
|---|---|
| **v2.0** | login com a Steam (este documento) |
| v2.1 | pro players (busca por nome + times em destaque) |
| v2.2 | diário (`match_notes`, RLS privado, teste com 2 contas) |
| depois | idioma (português/inglês) |

Login **só pela Steam**, sem e-mail e senha, por dois motivos do Alex: jogador de Dota já tem conta Steam e não quer cadastro por e-mail; e, logando com a Steam, o site já sabe qual é o ID da pessoa e mostra as partidas dela sem ela digitar nada. Ganho extra: a Steam **prova** que o ID é da pessoa. A v5 precisa disso ("ninguém comenta a própria partida"). Com e-mail, qualquer um poderia dizer que um ID é dele.

## Objetivos

1. Botão **"Entrar com a Steam"**: a pessoa aprova na página da própria Steam e volta logada. O site nunca vê a senha.
2. Logado, abrir `/` leva direto para **as próprias partidas** (`/player/<account_id>`).
3. **Cabeçalho** com:
   - perfil no canto superior direito (avatar + nome);
   - menu: "Minhas partidas", espaço para opções futuras e "Sair";
   - **campo de busca por ID**, que substitui o link "Buscar outro ID".
4. **Cartão do herói mais jogado com médias** (opção A do mockup): K/D/A médio, KDA, % de vitórias, GPM, XPM e last hits desse herói nas últimas 20 partidas. Aparece na página de **qualquer** jogador, não só na própria (confirmado pelo Alex).
5. Sair das páginas de e-mail e senha do template.

## Não-objetivos

- Pro players (v2.1), diário (v2.2), idioma, histórico além de 20 partidas (ideia futura no README; o banco já acumula `player_matches`, o limite é só na leitura).
- Login por e-mail ou senha, inclusive como alternativa.
- Apagar a conta pelo site, configurações de perfil, foto própria (o avatar vem da Steam/OpenDota).
- Proteger `/player` e `/match`. Elas continuam públicas.

## Anti-objetivos (falha mesmo que "funcione")

- **Alguém conseguir entrar como outra pessoa.** Uma resposta da Steam forjada ou reaproveitada não pode virar sessão. É a parte crítica: na v2.2 essa sessão vai proteger notas privadas.
- O cabeçalho deixar as páginas lentas. Hoje carregam em ~0,1–0,4 s em produção (aquecidas). O cabeçalho **não pode** fazer chamada à OpenDota a cada página.
- Usuário logado não conseguir buscar outro jogador. O antigo "Buscar outro ID" levava para `/`, que agora redireciona, e isso criaria um círculo.
- Guardar segredo novo em variável `NEXT_PUBLIC_` ou no cliente.

## Restrições

- Next 16 com `cacheComponents: true`: tudo que lê cookie/sessão fica dentro de `<Suspense>`. Middleware é o `proxy.ts` da raiz.
- Regras do template no `CLAUDE.md` do repo, que continuam valendo:
  - um cliente Supabase por request;
  - nada entre `createServerClient` e `getClaims()` no `updateSession`;
  - devolver o `supabaseResponse` ou copiar os cookies dele;
  - `getClaims()` no servidor.
- Toda tabela nova com RLS e políticas explicadas (regra do projeto).
- `npm test` antes de cada commit. Medir tempo em `npm run build && npx next start`, não no dev.
- Push na `main` = deploy em produção: perguntar antes.
- A Steam usa **OpenID 2.0**. O Supabase Auth não tem Steam entre os provedores. A verificação da Steam é código nosso, e a sessão do Supabase é criada pelo servidor.

---

## Como funciona

### 1. Fluxo de login

```
[Entrar com a Steam] → GET /auth/steam
   → redirect para https://steamcommunity.com/openid/login
       (checkid_setup, return_to = <origem>/auth/steam/callback, realm = <origem>,
        identity/claimed_id = identifier_select)
   → pessoa aprova na Steam
   → GET /auth/steam/callback?openid.*
       1. valida a resposta (ver §2)            — falhou → /auth/error
       2. SteamID64 → account_id (toAccountId)
       3. acha ou cria o usuário no Supabase (secret key, servidor)
       4. grava/atualiza profiles
       5. abre a sessão nos cookies (ver §3)
   → redirect para /player/<account_id>
```

- `openid.mode=cancel` (a pessoa cancelou na Steam) → volta para `/` sem erro assustador.
- `<origem>` = a origem do próprio request. Funciona em `localhost:3000`, na `.vercel.app` e em previews.

### 2. Validação da resposta da Steam (parte crítica)

A resposta só é aceita se **todas** as condições valerem:

- `openid.mode === "id_res"`;
- `openid.op_endpoint === "https://steamcommunity.com/openid/login"`;
- `openid.return_to` começa exatamente com `<origem>/auth/steam/callback`;
- `openid.claimed_id` casa com `^https://steamcommunity\.com/openid/id/(\d{17})$` e `openid.identity === openid.claimed_id`;
- confirmação direta com a Steam: POST para o `op_endpoint` com todos os `openid.*` recebidos, trocando `openid.mode` por `check_authentication`, e a resposta contendo `is_valid:true`. Rede falhou, timeout, resposta estranha → **recusa** (nunca "aceita na dúvida").

Fica numa função pura e testável (ex.: `lib/steam-openid.ts`, `server-only`), com `fetch` injetável ou simulado, como já é feito com a OpenDota.

**Reaproveitamento (replay):** precisa ser verificado no protótipo (§3) se a Steam recusa a **segunda** `check_authentication` da mesma resposta. Se recusar, basta isso. Se não recusar, o builder adiciona uma proteção própria: `openid.response_nonce` com horário de no máximo ~5 min e nonce já usado recusado. Onde guardar o nonce fica a critério do builder.

### 3. Sessão no Supabase: **protótipo primeiro**

O caminho previsto, ainda **não testado neste projeto**:

1. `admin.auth.admin.createUser({ email: <e-mail interno derivado do SteamID64>, email_confirm: true, app_metadata: { steam_id64, account_id } })`. Ele não manda e-mail. Se o usuário já existe, reaproveita.
2. `admin.auth.admin.generateLink({ type: "magiclink", email })` → `hashed_token`. Também não manda e-mail.
3. No cliente do servidor com cookies (`lib/supabase/server.ts`): `auth.verifyOtp({ type: "email", token_hash })` → sessão gravada nos cookies.

`account_id` vai em **`app_metadata`**, que só o servidor altera, e **nunca** em `user_metadata`, que o próprio usuário pode editar. Assim o `account_id` aparece nas claims do JWT e o `getClaims()` o entrega sem consultar o banco.

**O primeiro passo da implementação é um protótipo descartável** dos três passos, em `localhost`, respondendo:

- O Supabase aceita o domínio do e-mail interno? Qual domínio usar?
- `verifyOtp` com `token_hash` abre a sessão nos cookies dentro de um Route Handler?
- O `account_id` aparece em `getClaims()`?
- A Steam recusa a 2ª `check_authentication`?
- Dá para desligar "permitir novos cadastros" no Supabase Auth e ainda criar usuário pelo admin? Ver §6.

Se o caminho não funcionar, o builder escolhe outro e registra o porquê no documento ou no plano. A sessão tem que continuar sendo a do Supabase, para o `auth.uid()` funcionar no RLS da v2.2, e nenhum segredo pode ir ao cliente.

### 4. Tabela `profiles`

```sql
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  account_id  bigint not null unique,   -- Friend ID (32 bits), = players.account_id
  steam_id64  text   not null unique,
  created_at  timestamptz not null default now(),
  last_login  timestamptz not null default now()
);
```

- **Sem FK para `players`.** A pessoa pode logar antes de a OpenDota conhecer o perfil dela (perfil privado).
- **RLS:** ligado. Política de SELECT só da própria linha (`to authenticated using (auth.uid() = id)`). **Nenhuma política de escrita**: só o servidor grava, com a secret key, no callback do login. Nome, avatar e partidas são públicos e já ficam em `players`/`player_matches`. `profiles` guarda só a ligação "usuário do site ↔ conta Steam", que não precisa ser pública agora (v2.2/v5 revisam).
- Migração em `supabase/migrations/`, aplicada pelo MCP. Rodar `get_advisors` (security) depois.

### 5. Cabeçalho

- **Deslogado:** marca à esquerda, campo de busca e botão **"Entrar com a Steam"**. Na capa (`/`), o formulário de ID atual continua no centro.
- **Logado:** marca, campo de busca, avatar + nome com menu:
  - "Conectado pela Steam" + nome + ID (informativo);
  - **Minhas partidas** → `/player/<account_id>`;
  - (espaço para opções futuras: não colocar item vazio clicável);
  - **Sair** → encerra a sessão e volta para `/`.
- **Nome e avatar** vêm de `players` (banco). Se não houver linha, aparece "Conta <account_id>" com avatar neutro. **Nenhuma chamada à OpenDota no cabeçalho.**
- **Busca:** aceita código de amigo ou SteamID64 e navega para `/player/<id>`. Reaproveita a lógica do `steam-id-form.tsx`. A validação continua na página do jogador. Na v2.1 a mesma caixa passa a sugerir pro players por nome, então o componente não deve ser feito de um jeito que impeça isso.
- **Espaço reservado** no layout para o link "Pro players" (v2.1) e o seletor de idioma (depois). Só o espaço, sem elementos falsos.
- **Celular** (~390 px): o cabeçalho não pode estourar a largura. Como encolher a busca (ícone que abre o campo, linha própria…) fica a critério do builder.
- A parte que lê a sessão fica em `<Suspense>`, com um fallback do mesmo tamanho para o layout não pular.

### 6. Redirecionamento e rotas

- **Logado em `/`** → `/player/<account_id>`. Fazer no `proxy.ts`, que já chama `getClaims()`, usando o `account_id` das claims, é o caminho mais barato. Se fizer lá, respeitar a regra de copiar os cookies do `supabaseResponse` para o redirect.
- **Proteção de rotas continua "negado por padrão"** (allowlist em `lib/supabase/proxy.ts`):
  - entram `/auth/steam` e `/auth/steam/callback`;
  - saem as rotas do template removidas;
  - o redirect de "sem login" passa a ir para `/` (não existe mais `/auth/login`);
  - nenhuma página nova da v2.0 exige login.
- **Nenhum caminho de login por e-mail pode sobrar** (decisão minha, após a revisão do builder). Com a chave pública, a API do Supabase aceita `signUp`, `signInWithPassword` e `signInWithOtp` direto, sem passar pelo site. Requisitos:
  - os usuários Steam **não têm senha**;
  - o e-mail interno usa um domínio que **ninguém consegue receber** (de preferência o reservado `.invalid`, se o Supabase aceitar; senão, um subdomínio sem MX, decidido no protótipo). Assim ninguém recebe o link mágico de outra pessoa;
  - "Allow new users to sign up" desligado no painel. O admin continua criando usuários (confirmar no protótipo);
  - desligar o provedor Email inteiro **só se** o protótipo mostrar que `generateLink` + `verifyOtp` continuam funcionando assim.
- **Configuração do painel do Supabase Auth: quem faz é o Alex**, como na v1.5 (o MCP não altera essa configuração). O plano precisa ter essa etapa manual explícita, com o que marcar.

### 7. Cartão do herói mais jogado

- Estende `lib/player-summary.ts` (`mostPlayed`). Para o herói mais jogado, considerando só as partidas com ele:
  - **K/D/A médio:** média de kills, deaths e assists, uma casa decimal (vírgula, pt-BR).
  - **KDA:** `(soma K + soma A) / max(1, soma D)`, uma casa.
  - **% de vitórias:** vitórias ÷ partidas com resultado definido. Se nenhuma tiver resultado, mostra "—".
  - **GPM, XPM, last hits:** média arredondada para inteiro.
- Layout: o cartão atual com uma grade de 3 × 2 (mockup A).
- Testes no `tests/player-summary.test.ts`: médias, KDA com 0 mortes, partida sem resultado, desempate atual mantido.

### 8. Limpeza do template

**Remover:**
- `app/auth/{login,sign-up,sign-up-success,forgot-password,update-password,confirm}`, `app/protected`;
- `components/{login,sign-up,forgot-password,update-password}-form.tsx`, `auth-button.tsx`;
- `components/tutorial/`, `hero.tsx`, `deploy-button.tsx`, `env-var-warning.tsx`, `next-logo.tsx`, `supabase-logo.tsx`;
- `hasEnvVars` (e o desvio dele no `proxy`).

**Manter e adaptar:** `app/auth/error` (com o visual do site e mensagens em português), `logout-button.tsx` (pode ser reaproveitado no menu).

Conferir com busca por imports antes de apagar cada arquivo.

### 9. Ambiente e ordem de validação (decidido pelo Alex, 2026-11-10)

- **Só existe um Supabase, o de produção.** O protótipo (§3) e o desenvolvimento rodam em `localhost` contra ele. Os usuários de teste criados no protótipo são apagados depois. A migração de `profiles` só adiciona.
- **Auth começa vazio:** o único usuário (e-mail, teste do template de 2026-11-06) foi apagado em 2026-11-10 a pedido do Alex. Não existe caso "logado sem `account_id`" para tratar.
- **Antes da `main`:** enviar o branch `v2.0` ao GitHub (perguntar antes do push). A Vercel gera um **preview**, e o Alex testa ali o login real com a Steam. Pré-requisito manual: as env vars na Vercel marcadas também para "Preview". Só depois o merge na `main`, que vai para produção, também com pergunta antes.

---

## Pronto quando

0. No preview do branch `v2.0`, o login com a Steam funciona de ponta a ponta antes do merge.
1. Em produção, clico em "Entrar com a Steam", aprovo e caio em `/player/<meu id>` com meu avatar e nome no cabeçalho.
2. Saio, entro de novo e a mesma conta é reaproveitada (sem `profiles` duplicado).
3. Logado, abrir `/` me leva às minhas partidas, e a busca do cabeçalho me leva a outro jogador.
4. **Testes automáticos** da validação recusam, cada um:
   - `op_endpoint` errado;
   - `return_to` de outra origem;
   - `claimed_id` fora do formato;
   - `identity ≠ claimed_id`;
   - `is_valid:false`;
   - falha de rede;
   - `mode` diferente de `id_res`.

   Pelo menos o caso válido é aceito. O replay foi verificado no protótipo, e a proteção própria tem teste se tiver sido necessária.
5. O cartão mostra as médias na página de qualquer jogador.
6. `anon` não lê `profiles`; usuário logado lê só a própria linha (conferido com SQL). Advisors sem alerta novo do nosso código.
7. Tempo de `/player/[id]` em `next start` igual ao da v1.5 (±50 ms), medido antes e depois, **deslogado e logado**. O projeto já assina os JWT com **ES256** (conferido no JWKS em 2026-11-10), então o `getClaims()` valida localmente, sem ida ao servidor de Auth a cada página.
8. Com a chave pública, tentar `signUp` e `signInWithPassword` para o e-mail interno de um usuário Steam falha. `signInWithOtp` não entrega nada que alguém possa receber.
9. Nenhuma página/arquivo do template de e-mail sobrando. `npm run lint`, `npx tsc --noEmit`, `npm test` e `npm run build` passam.

## Entregas além do código

- Versão **2.0.0**: `package.json`, `CHANGELOG.md`, tag `v2.0.0`.
- `README.md`:
  - roteiro renumerado (v2.0 login Steam, v2.1 pros, v2.2 diário, depois idioma);
  - ideia futura "histórico além de 20 partidas / por herói".
- `CLAUDE.md` do repo: seções "Auth architecture" e "Route protection" reescritas para o fluxo Steam. Remover a frase "Template leftovers".

## Deixado para o builder

- Nomes de arquivos/rotas além dos citados, e o componente do menu (shadcn `dropdown-menu` é o natural; lembrar da conversão v4 → v3 do `CLAUDE.md`).
- Domínio do e-mail interno e o caminho da sessão, conforme o protótipo (§3).
- Onde guardar nonces, se a proteção própria for necessária.
- Comportamento da busca no celular.
- Texto exato das mensagens de erro do login (português, sem jargão).
