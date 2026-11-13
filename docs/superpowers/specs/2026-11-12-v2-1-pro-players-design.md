# v2.1 — Pro players: design

Data: 2026-11-12 · Status: **aprovado pelo Alex** em 2026-11-12, com duas mudanças dele já incorporadas (atualização diária por tarefa agendada; elenco inteiro nos cartões). Mockups de referência (não versionados): `.superpowers/brainstorm/2919-1794454402/content/busca-dropdown.html` (escolhida: **B**) e `capa-e-pros.html`.

Legenda: **[Alex]** = decidido por ele no brainstorm. **[minha escolha]** = decisão minha, que ele pode derrubar ao ler.

## Por quê

Quem chega sem saber o próprio ID não tem como experimentar o site. E muita gente quer ver as partidas de um profissional: sabe o nick (às vezes escrito errado), mas não sabe o time nem o ID. A v2.1 resolve os dois.

## Objetivos

1. **Buscar pro player pelo nick** [Alex: é a coisa que a versão tem de fazer bem]. Uma caixa só, que aceita nick ou ID, tolera erro de digitação e mostra sugestões enquanto a pessoa digita.
2. **Página `/pros`**: busca grande + "Times em destaque" (brasão, rating, elenco clicável).
3. **Capa**: bloco "Ainda sem o seu ID?" com "Ver um exemplo" e "Partidas dos pro players".
4. **"Ver um exemplo"**: abre as partidas de um profissional sorteado. Na tela da partida, uma dica curta e dispensável.
5. **"Perfil na Steam ↗"** na página de partidas de qualquer jogador.
6. **"?" que explica o rating** dos times.
7. **Menu do avatar** com mais opções (lista abaixo).
8. Link **"Pro players"** no cabeçalho de todas as páginas.

## Não-objetivos

- **"Quem joga comigo"** (ideia do Alex de "partidas de amigos"). Vira a **v2.2**, com brainstorm próprio, usando `/players/{id}/peers` da OpenDota em vez da lista de amigos da Steam [Alex concordou]. O diário passa a ser v2.3. O item não aparece no menu nesta versão.
- Foto real do jogador: a OpenDota só tem o avatar da Steam [Alex aceitou o avatar].
- Tour guiado passo a passo [Alex aceitou só o exemplo + dica].
- Pros favoritos/seguidos, página própria de time, estatísticas no menu, idioma, excluir conta.

## Anti-objetivos (falha mesmo que "funcione")

- **Apresentar um homônimo como se fosse o profissional.** A lista da OpenDota tem 8 "Yatoro"; só um é o da Team Spirit. O selo de verificado e o grupo separado existem para isso.
- **Sugestão que leva a tela vazia** sem aviso. Por isso a linha mostra "jogou há X".
- **Deixar o cabeçalho lento.** Ele não pode ganhar consulta nenhuma no carregamento da página; a busca só chama o servidor quando a pessoa digita.
- Chamar a OpenDota a cada tecla ou a cada visita a `/pros`.
- "Ver um exemplo" cair num jogador sem partidas.

## Restrições

As do `CLAUDE.md` do repo, em especial: OpenDota só no servidor e só em `lib/opendota.ts`; páginas chamam `lib/data.ts`; gravações dentro de `after()`; tabela nova com RLS e políticas explicadas; `npm test` antes de cada commit e caso novo para cada ramo novo em `lib/data.ts`; tempo medido em `npm run build && npx next start`; push na `main` só com ok do Alex; `cacheComponents: true` (o que lê cookie fica em `<Suspense>`); `npx shadcn add` gera Tailwind v4 e precisa de conversão.

## Dados conferidos na OpenDota (2026-11-12)

- `GET /proPlayers`: **5.765** registros. Campos usados: `account_id`, `name` (nick de pro), `personaname`, `avatarmedium`, `team_id`, `team_name`, `team_tag`, `is_locked`, `last_match_time` (ISO, pode ser `null`). `is_locked: true` = verificado: **476**. Entre os verificados há 6 nicks repetidos.
- `GET /teams`: **1.000** times, já ordenados por `rating`. Campos: `team_id`, `name`, `tag`, `logo_url` (pode ser `null`; hosts variados), `rating`, `last_match_time` (segundos Unix). Sem filtro de atividade aparecem times parados desde 2018.
- `GET /teams/{id}/players`: `account_id`, `name`, `games_played`, `is_current_team_member`. O elenco "atual" tem de 4 a 6 nomes (inclui reserva).
- Só 173 dos 476 verificados têm time com `logo_url` em `/teams`.
- Rating: Elo. Conferido no código da OpenDota (`odota/core`, `svc/util/insert.ts` e `dev/teamElo.ts`): time novo começa em **1000**, **K = 32**, expectativa `10^(r/400)`, atualizado a cada partida em que **os dois lados** são times registrados.

---

## Como funciona

### 1. Banco

Migração nova `supabase/migrations/<data>_v2_1_pros.sql`, aplicada pelo MCP (`apply_migration`), seguida de `get_advisors`.

**`pro_teams`** — os 1.000 times de `/teams`.
`team_id` (pk), `name`, `tag`, `logo_url`, `rating`, `last_match_time`, `roster` (jsonb, `null` exceto nos times em destaque: lista de `{account_id, name}`), `fetched_at`.

**`pro_players`** — os registros de `/proPlayers`.
`account_id` (pk), `name`, `name_norm` (nick normalizado, ver §3), `personaname`, `avatar`, `team_id`, `team_name`, `team_tag`, `verified` (= `is_locked === true`), `last_match_time`, `fetched_at`.
`team_id` **não** é chave estrangeira: muitos pros apontam para times fora dos 1.000.

**`pros_refresh`** — uma linha, controla a renovação (ver §2).

**RLS, igual em `pro_teams` e `pro_players`** (mesmo modelo das tabelas da v1.3): RLS ligado + uma política de SELECT para `anon` e `authenticated`; nenhuma política de escrita, então só o servidor grava com a secret key. São dados que já são públicos na OpenDota.

**Busca tolerante a erro:** extensão `pg_trgm` + índice trigram em `name_norm` + função SQL `search_pros(q text)` (`security invoker`, `search_path` fixo, `execute` para `anon`), que devolve os campos da linha do dropdown já com `logo_url` do time [minha escolha: no banco, e não baixando os 5.765 nomes para o navegador, para o cabeçalho continuar leve].

### 2. Atualização dos dados (`lib/data.ts` + `lib/opendota.ts`)

`lib/opendota.ts` ganha `getProPlayers()`, `getTeams()` e `getTeamPlayers(teamId)`.

`lib/data.ts` ganha a regra, com validade de **1 dia**:

- Lê `max(fetched_at)` de `pro_teams`.
- **Vazio** (primeira vez): busca na OpenDota na hora e grava em `after()`.
- **Vencido**: responde com o que há no banco e renova em `after()`.
- **Em dia**: só banco.
- OpenDota falhou: mantém o que há; se não há nada, `/pros` mostra a mensagem de erro padrão (`StatusMessage`).

Uma renovação = 1 chamada a `/proPlayers` + 1 a `/teams` + 6 a `/teams/{id}/players` (com pausa entre elas, dentro do limite gratuito). Grava em lotes e apaga os registros que saíram da lista.

**Quem dispara: uma tarefa diária** [Alex, na leitura do documento: lista velha tira credibilidade do site; atualizar todo dia, usado ou não].

- `vercel.json` ganha um cron diário (o plano Hobby da Vercel permite uma execução por dia, em horário aproximado) que chama `GET /pros/refresh`.
- `app/pros/refresh/route.ts`: só executa se o cabeçalho `Authorization` for `Bearer <CRON_SECRET>` (comparação em tempo constante); senão responde 401 sem fazer nada. A Vercel envia esse cabeçalho sozinha quando a variável `CRON_SECRET` existe. Faz a renovação **dentro da resposta** (não em `after()`), com `maxDuration` de 60 s, e responde quantos registros gravou.
- **`CRON_SECRET` é um segredo novo**: variável de ambiente só do servidor, criada pelo Alex no painel da Vercel (Production) com um valor aleatório longo; nunca `NEXT_PUBLIC_`. Entra no `.env.example` sem valor. O cron só roda no deploy de produção.
- **Rede de segurança:** a visita a `/pros` e o "Ver um exemplo" continuam disparando a renovação pela regra acima se o dado estiver vencido (cron falhou, primeira vez, ambiente local). A busca não dispara.

**Uma renovação por vez** [minha escolha, pedida pela revisão]: tabela de uma linha `pros_refresh` (`attempted_at`, `completed_at`). Antes de chamar a OpenDota, o servidor "reserva" a renovação com um UPDATE condicional (só passa se `attempted_at` tem mais de 10 minutos); quem não conseguir reservar usa o que há no banco. Assim, visitas simultâneas ou a OpenDota fora do ar geram no máximo uma tentativa a cada 10 minutos, e não 8 chamadas por visita. "Em dia" = `completed_at` com menos de 1 dia (substitui o `max(fetched_at)` acima). RLS ligado e **nenhuma** política: só o servidor, com a secret key, lê e grava. Sem `SUPABASE_SECRET_KEY` (ambiente local incompleto) não há renovação: `/pros` busca na OpenDota a cada visita e a busca fica vazia, como já acontece com o resto do cache.

**Times em destaque** (função pura, testada): dos times com `last_match_time` nos últimos **60 dias**, os **6** de maior rating [Alex aprovou o filtro de 60 dias e viu 6 no mockup]. Time sem brasão entra, com a sigla no lugar. **Elenco**: **todos** os `is_current_team_member`, ordenados por `games_played` [Alex: quem procura pelo time pode não lembrar o nick, então o sexto jogador também aparece]. Hoje são de 4 a 6 por time; o cartão cresce conforme o elenco. A OpenDota não diz quem é reserva ou coach, então não há marcação.

### 3. Busca

**Normalização** (função pura em `lib/`, usada na gravação e na consulta): minúsculas, sem acento, só letras e números **de qualquer alfabeto** (`\p{L}\p{N}`). "Miracle-" → `miracle`; "No[o]ne-" → `noone`; "天鸽" continua "天鸽". Cuidado: restringir a `a-z0-9` apagaria o nick de 13 profissionais verificados (chineses, japoneses, russos). Nick que normaliza para vazio fica fora da busca.

**Nicks repetidos entre verificados** (conferido: Panda, Q, z, Danial, Nesfeer, kotoamatsukami, Ikigai): são pessoas diferentes, em times diferentes. Aparecem **todos** no grupo de verificados, sem desempate; o nome do time e o "jogou há X" na linha é que diferenciam.

**Rota** `app/pros/search/route.ts` (`GET ?q=`), servidor:

- menos de 2 caracteres úteis ou mais de 32 → lista vazia, sem ir ao banco;
- chama `search_pros` com o cliente de leitura;
- responde `{ verified: [...], others: [...] }`, no máximo 5 em cada;
- `Cache-Control` curto (minutos) para a CDN absorver repetições.

**Ordem dentro de cada grupo:** começa com o texto digitado → contém → parecido (trigram, só a partir de 3 caracteres); empate desfeito por partida mais recente. Casos que têm de passar: `yat` → Yatoro verificado em primeiro; `yatorro` → Yatoro; `miracle` → Miracle-.

**Componente** (evolução de `components/header-search.tsx`, cliente):

- Espera ~150 ms depois da última tecla; descarta resposta antiga.
- Dropdown **B** [Alex]: grupo "Profissionais verificados" (avatar maior, nick + selo ✓, "Time · jogou há X", brasão) e grupo "Outros jogadores com esse nome" (avatar, nick, "Time · jogou há X", sigla). Trecho digitado em destaque no nick. Sem time: só "jogou há X". Sem `last_match_time`: "sem partidas recentes".
- Sem brasão → sigla do time em texto. Imagem que falha → mesma queda.
- Teclado: ↑ ↓ escolhem, Enter abre, Esc fecha. Padrão acessível de combobox.
- **Só dígitos + Enter sem nada escolhido** → `/player/<id>`, como hoje. Texto + Enter → abre a primeira sugestão. Sem resultado → "Nenhum pro com esse nome. Para outros jogadores, use o ID."
- Sai o `inputMode="numeric"`. Placeholder: "Nome do pro ou ID da Steam".
- Avatares e brasões com `<img>` simples e `loading="lazy"` [minha escolha: os brasões vêm de hosts variados, e imagens tão pequenas não justificam `next/image`].

### 4. Página `/pros`

Servidor, dados de `lib/data.ts`. Título "Partidas dos pro players", busca grande (o mesmo componente, em tamanho maior) e "Times em destaque" em grade de 3 colunas (1 no celular). Cada cartão: brasão, nome, rating, e os jogadores (avatar + nick + selo se verificado), cada um link para `/player/<account_id>`.

Nesta página o cabeçalho **não** mostra a caixa de busca pequena [Alex aprovou]: `SiteHeader` ganha uma opção para escondê-la.

**"?" do rating**: abre com clique ou toque (não com o mouse por cima, para funcionar no celular) e fecha tocando fora. Um só, ao lado do título "Times em destaque", e não um por cartão [minha escolha]. Texto:

> **Rating** — pontuação calculada pela OpenDota no sistema Elo, o mesmo do xadrez. Todo time começa em 1000. A cada partida entre dois times registrados, o vencedor ganha pontos e o perdedor perde os mesmos pontos; vencer um time mais forte vale mais. Não é um ranking oficial da Valve.

`/pros` entra em `PUBLIC_PREFIXES` (`lib/auth-routing.ts`), o que também libera `/pros/search` e `/pros/example`.

### 5. Capa e "Ver um exemplo"

Abaixo do formulário, separado por uma linha: rótulo "Ainda sem o seu ID?" e dois botões discretos, **"Ver um exemplo →"** e **"Partidas dos pro players →"**. A capa continua estática.

`app/pros/example/route.ts`: sorteia um jogador **verificado**, do elenco dos times em destaque, com partida nos últimos 30 dias, e redireciona para `/player/<id>`. Sem candidato → `/pros`. O link é `<a>` simples (não `<Link>`), para não haver pré-carregamento de um redirect sorteado.

**Dica na tela da partida** [minha escolha: aparece para todo mundo, não só para quem veio do exemplo]: uma linha "Clique num herói para ver os detalhes. Passe o mouse num item para ver o que ele faz." com um "×". Dispensada, não volta (`localStorage` `dota-own-coach:match-tip`). Armazenamento bloqueado não pode derrubar a tela.

### 6. Página do jogador

- **"Perfil na Steam ↗"** no cabeçalho da página, para qualquer jogador: `https://steamcommunity.com/profiles/<SteamID64>`, nova aba, `rel="noopener noreferrer"`. `lib/steam.ts` ganha a conversão inversa (`account_id` + 76561197960265728, com `BigInt`).
- **Identidade de pro** [minha escolha, não discutida]: se o `account_id` está em `pro_players` **e é verificado**, uma linha extra "Pro: Yatoro ✓ · Team Spirit" junto ao nome. O título continua sendo o nome da Steam. Sem isso, quem clica em "Yatoro" cai numa página chamada "00 mafia" e acha que errou. Não verificado não ganha a linha (anti-objetivo do homônimo). A leitura é só no banco e sai junto com as outras da página.

### 7. Cabeçalho e menu do avatar

`SiteHeader` passa a mostrar o link "Pro players" em todas as páginas, inclusive no celular.

Menu [Alex aprovou esta lista]:

1. Avatar, nome, "Conectado pela Steam".
2. **Código de amigo** + botão de copiar (mostra "Copiado" por um instante).
3. Minhas partidas · **Meu perfil na Steam ↗** · **Pro players**.
4. **Animação dos heróis**: ligada/desligada. Usa a preferência que já existe (`dota-own-coach:hero-motion`); o herói na tela obedece na hora, sem recarregar.
5. **Sair**: passa a desconectar **só este aparelho** (era pendência da v2.0). O recarregamento completo depois de sair continua.

---

## Testes

Novos casos em Vitest para: normalização do nick; escolha dos times em destaque e do elenco; sorteio do exemplo (inclusive sem candidato); conversão para SteamID64; `routeFor` com `/pros`; as funções novas de `lib/opendota.ts` com `fetch` simulado; os quatro ramos da regra de 1 dia em `lib/data.ts`, mais "reserva negada" e "sem secret key"; validação de `q` na rota de busca.

A ordem da busca roda no banco: conferir com SQL real, pelo MCP, os três casos do §3.

## Pronto quando

1. Digitar `yatorro` na busca mostra o Yatoro da Team Spirit no grupo de verificados, e um clique abre as partidas dele.
2. `/pros` mostra 6 times ativos com o elenco inteiro, e recarregar não gera nenhuma linha `[OpenDota] GET` no log.
2b. `/pros/refresh` sem o segredo responde 401; com o segredo renova a lista; e, em produção, o `completed_at` muda sozinho de um dia para o outro sem ninguém visitar o site.
3. "Ver um exemplo", clicado 5 vezes, sempre abre um jogador com partidas.
4. Tempo de `/player` e `/match` em produção igual ao da v2.0 (~0,1–0,4 s aquecidas); `/pros` na mesma faixa.
5. `get_advisors` sem alerta novo nas tabelas e na função.
6. Celular (390 px): dropdown, `/pros`, "?" do rating e menu utilizáveis, sem a página esticar para o lado.

## Entrega

Branch `v2.1`, preview da Vercel conferido pelo Alex antes do merge, versão `2.1.0` (`package.json`, `CHANGELOG.md`, tag). README: marcar a v2.1 e renumerar o roteiro (v2.2 "Quem joga comigo", v2.3 diário, com o backup do banco como pré-requisito da v2.3). Atualizar o `CLAUDE.md` do repo.

## Fica para quem implementa

Nomes de arquivos e componentes, SQL exato de `search_pros` e os limiares de semelhança, tamanho dos lotes e da pausa entre chamadas, como o herói fica sabendo da troca feita no menu, componente do "?" (se vier do shadcn, converter para Tailwind v3), textos menores e espaçamentos.
