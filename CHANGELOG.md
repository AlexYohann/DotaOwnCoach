# Changelog

Versões seguem [SemVer](https://semver.org/lang/pt-BR/): MAJOR.MINOR.PATCH.
Cada versão tem uma tag git `vX.Y.Z`.

## [2.2.0] — 2026-11-14

### Adicionado
- **Linha do tempo do herói** no painel do herói selecionado, na tela da partida. Uma barra com o tempo da partida: escolha um minuto e veja o ritmo de ouro e de XP (quanto o herói ganhou por minuto nos últimos 3 minutos) e o GPM/XPM até ali. Atrás da barra, o gráfico do ritmo (Ouro ou XP) com o ícone de cada item grande na hora em que foi fechado; passar o mouse num ícone mostra o ritmo antes e três minutos depois do item. Serve para estudar build: quanto o farm subiu depois de uma Battle Fury ou de um Maelstrom.
- Começa recolhida, atrás do botão "Mostrar OPM e XPM minuto a minuto" (pedido do Alex: a tela ficava poluída); o navegador lembra se a pessoa deixou aberta. Fechada, a análise do replay não é pedida.
- "Fechados até aqui": os itens grandes que o herói já tinha no minuto escolhido. "Item grande" = item montado de 2.000 de ouro ou mais.
- **Só para quem está logado.** Deslogado, aparece um convite com "Entrar com a Steam"; os dados minuto a minuto nem são enviados ao navegador.
- **Análise do replay sob demanda.** Os dados por minuto só existem em partidas que a OpenDota processou (das últimas 20 do Alex, 3 estavam). Ao abrir uma partida não processada, o site pede a análise, mostra "Analisando o replay…" e a linha do tempo aparece sozinha quando fica pronta (medido: 20 a 40 segundos).

### Técnico
- Regras em `lib/timeline.ts` (ritmo, média, item grande, eixo, rótulos dos minutos); dados por minuto (`gold_t`, `xp_t`, `purchase_log`) em `MatchPlayer.timeline`, só em partida processada (`MatchDetail.parsed`). `DETAIL_VERSION` 4: as partidas salvas são buscadas de novo uma vez.
- Pedido de análise em `lib/match-parse.ts` + rota `/match/[id]/parse` (`POST` pede, `GET` acompanha; exige login). Cada pedido pesa como 10 chamadas no limite gratuito da OpenDota, por isso: um pedido por partida (trava no banco, à prova de duas abas), só partidas de até 14 dias, no máximo 3 pedidos por minuto e 50 por dia no site inteiro. Antes de pedir, o site confere se a OpenDota já processou a partida sozinha (comum em partidas de profissionais). Colunas `matches.parse_requested_at` e `matches.parse_job_id` (migração `20261113000000_v2_2_match_parse.sql`; RLS sem mudança).
- Gráfico em SVG desenhado à mão, sem biblioteca nova; cores conferidas contra o fundo do painel.
- Revisão final (antes do merge): quem fechava a aba antes de a análise terminar e voltava dias depois via "Não foi possível analisar" mesmo com a partida processada; uma segunda aba aberta no meio do pedido também; seis partidas abertas em sequência podiam esgotar o limite por minuto da OpenDota (um 429 queimava a chance da partida); o minuto inicial podia mostrar o primeiro item como ainda não fechado. Todos corrigidos com teste.
- 312 testes (Vitest). Tempo da tela da partida aquecida igual ao da v2.1 (~0,07–0,1 s em `next start`, logado e deslogado).

## [2.1.0] — 2026-11-12

### Adicionado
- **Busca de pro players pelo nick**, na caixa do cabeçalho de todas as páginas. Tolera erro de digitação ("yatorro" acha o Yatoro). As sugestões vêm em dois grupos: "Profissionais verificados" (com selo, time e brasão) e "Outros jogadores com esse nome" — existem vários "Yatoro", só um é o da Team Spirit. Número + Enter continua sendo busca por ID.
- **Página Pro players** (`/pros`): busca grande e os 6 times mais bem colocados que jogaram nos últimos 60 dias, cada um com o elenco atual inteiro. Clicar num jogador abre as partidas dele. Um "?" explica o que é o rating.
- **Capa:** "Ver um exemplo" (abre as partidas de um profissional sorteado) e "Partidas dos pro players", para quem chega sem o próprio ID.
- **Tela da partida:** dica "Clique num herói…", que some de vez quando dispensada.
- **Página do jogador:** link "Perfil na Steam ↗" para qualquer jogador e, se for um profissional verificado, a linha "Pro: nick ✓ · time" (o nome da Steam quase nunca é o nick).
- **Menu do avatar:** código de amigo com botão de copiar, "Meu perfil na Steam", "Pro players" e liga/desliga da animação dos heróis.

### Corrigido
- **Lone Druid aparecia sem itens.** Quem carrega os itens é o urso, e a OpenDota os manda num campo separado (`additional_units`) que o site não lia. Agora a tela da partida mostra os itens do urso no painel do herói e numa segunda linha nas tabelas dos times. Partidas já salvas são buscadas de novo (`DETAIL_VERSION` 3).

- **Nome e avatar antigos depois de trocar na Steam.** A OpenDota guarda uma cópia do perfil e não a renova sozinha com frequência, então o site mostrava o nome antigo por dias. Agora, quando você abre as próprias partidas logado, o site pede a renovação à OpenDota (no máximo uma vez por dia, depois de a página responder) e grava o nome e o avatar novos; eles aparecem na visita seguinte. Para jogadores que não estão logados o nome ainda pode atrasar (`lib/profile-refresh.ts`, coluna `profiles.profile_refreshed_at`).

### Alterado
- "Sair" encerra a sessão só neste aparelho (antes desconectava todos os navegadores da conta).
- A caixa de busca do cabeçalho aceita texto (antes só número) e ficou um pouco mais larga.

### Técnico
- Tabelas `pro_teams`, `pro_players` e `pros_refresh` (migração `20261112000000_v2_1_pros.sql`): RLS com leitura pública nas duas primeiras e nenhuma política na terceira (só o servidor); nenhuma política de escrita. Busca pela função SQL `search_pros` (`pg_trgm`), 5 resultados por grupo.
- A lista da OpenDota (`/proPlayers`, `/teams`, `/teams/{id}/players`) é copiada para o banco uma vez por dia por um cron da Vercel (`/pros/refresh`, 09:00 UTC, protegido por `CRON_SECRET`). Visitar `/pros` com a lista vencida renova depois da resposta (rede de segurança). Uma trava de 10 minutos impede duas renovações ao mesmo tempo, e uma lista vazia ou minúscula da OpenDota é recusada em vez de apagar a boa.
- `/pros/search` só lê o banco e responde vazio, sem consulta, para texto curto ou só de símbolos; a CDN guarda cada resposta por 5 minutos. Carregar uma página não faz pedido de busca.
- Regras puras em `lib/pros.ts` (normalização de nick em qualquer alfabeto, times em destaque, "jogou há X", destino do Enter); dados em `lib/pros-data.ts`.
- A preferência de animação avisa a mudança por um evento (`HERO_MOTION_EVENT`): menu e banner ficam em sincronia sem recarregar.
- Revisão final (antes do merge): (1) `search_pros` confere o texto ela mesma (2 a 32 caracteres, sem `%`, `_` ou barra invertida) — a função é chamável direto com a chave pública, e um texto enorme fazia o banco calcular semelhança contra a tabela inteira (migração `20261112010000_v2_1_search_pros_guard.sql`); (2) elenco vazio ou nenhum time ativo vindos da OpenDota com HTTP 200 são recusados em vez de apagar os cartões bons; (3) data malformada ou ID repetido num registro não derrubam mais a renovação inteira.
- 254 testes (Vitest). Tempos aquecidos em `next start`: `/player` ~0,09–0,15 s, `/match` ~0,08 s, `/pros` na mesma faixa.

## [2.0.0] — 2026-11-10

### Adicionado
- **Entrar com a Steam**, sem e-mail nem senha. A Steam confirma quem é você; o site guarda só a ligação entre a sua conta do site e a conta Steam.
- Logado, abrir o site leva direto às suas partidas.
- Cabeçalho em todas as páginas: busca por código de amigo ou SteamID64, e seu avatar com menu (Minhas partidas, Sair). Deslogado, botão "Entrar com a Steam".
- Cartão do herói mais jogado com as médias desse herói nas últimas 20 partidas: K/D/A, KDA, % de vitórias, GPM, XPM e last hits (em qualquer jogador).

### Removido
- Login por e-mail e senha do template (cadastro, esqueci a senha, confirmação, `/protected`) e as peças de tutorial.

### Técnico
- Steam é OpenID 2.0 (o Supabase Auth não tem Steam): `lib/steam-openid.ts` valida a resposta (endpoint, `return_to` da nossa origem, `claimed_id` = `identity`, e `check_authentication` com a própria Steam; qualquer dúvida recusa). A Steam já recusa a mesma resposta usada duas vezes (conferido), por isso não há tabela de nonces.
- Sessão do Supabase aberta pelo servidor (`lib/steam-session.ts`): usuário com e-mail interno `<SteamID64>@steam.invalid` e sem senha, `generateLink` + `verifyOtp`. `account_id` vai em `app_metadata` (só o servidor altera) e chega no JWT (ES256), então proxy e cabeçalho não consultam o banco para saber quem é.
- No painel do Supabase Auth: cadastro público e provedor de e-mail desligados — `signUp`, `signInWithPassword` e `signInWithOtp` com a chave pública são recusados.
- Tabela `profiles` (migração `20261110000000_v2_0_profiles.sql`): RLS com leitura só da própria linha; nenhuma política de escrita.
- Regras de rota em `lib/auth-routing.ts` (testadas): rotas públicas por segmento (`/players-falso` não é público), sem login → `/`.
- Revisão final de segurança (antes do merge): (1) parâmetro `openid.*` repetido é recusado — com o `claimed_id` da vítima na frente de uma resposta genuína do atacante, a validação lia um e a Steam confirmava o outro, o que permitia entrar como qualquer conta; (2) `state` aleatório num cookie HttpOnly, conferido no `return_to` assinado (login CSRF); (3) origem do login só da lista fixa (produção/preview da Vercel ou localhost), sem confiar no Host do request.
- "Sair" recarrega a página: o cache de navegação do Next guardava o redirecionamento do estado logado e voltava para as partidas.
- 174 testes (Vitest). Tempo de `/player/[id]` medido antes e depois em `next start`.

## [1.5.0] — 2026-11-08

### Adicionado
- Site no ar: https://dota-own-coach.vercel.app (Vercel, deploy automático a cada push na `main`).

### Técnico
- `vercel.json`: funções em `gru1` (São Paulo), ao lado do Supabase (`sa-east-1`, conferido pelo IP do banco).
- Variáveis de ambiente na Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (só no servidor).
- Conferido no ar: as três telas, animação, gravação no banco pela função publicada; tempo com função aquecida ~0,2 s (jogador) e ~0,35 s (partida).

## [1.4.2] — 2026-11-08

### Corrigido
- A tela da partida dizia "Sem cosméticos registrados nesta partida" em todas as partidas recentes. Causa: a OpenDota não entrega mais cosméticos no patch atual (60), nem em partidas processadas ou profissionais — só em partidas antigas (ex.: patch 56). Agora a seção só aparece quando há cosméticos.

## [1.4.1] — 2026-11-08

### Corrigido
- Heróis apareciam parados para quem tem "Efeitos de animação" desligado no Windows (preferência "reduzir movimento"). Agora a animação toca sempre, e um botão "⏸ Pausar animação" / "▶ Animar" no canto do cabeçalho para e retoma — a escolha fica salva no navegador (decisão do Alex).

## [1.4.0] — 2026-11-08

### Adicionado
- Visual novo, só no tema escuro (paleta, fontes Barlow Condensed + Inter, rodapé "Projeto de fã, não afiliado à Valve.").
- Heróis animados oficiais da Valve: herói sorteado na home, herói da última partida na página do jogador, herói selecionado na tela da partida. A animação nunca atrasa a página (entra depois, com fade); quem prefere menos movimento vê o primeiro quadro parado; sem animação disponível, aparece a imagem estática.
- Home estilo capa, com link direto para o "Código de amigo" da Steam.
- Página do jogador: última partida em destaque (resultado · lado · K/D/A), cartão do herói mais jogado nas últimas 20 e coluna "Lado" na tabela.
- Tela da partida: cosméticos usados por cada jogador (com cor de raridade), times em dois modos (Empilhados, completo; Lado a lado, minimalista), lembrado no navegador, e ordenação por coluna dentro de cada time (maior → menor → original).

### Técnico
- `lib/hero-art.ts`, `lib/player-summary.ts`, `lib/team-sort.ts` com testes (81 no total); `DETAIL_VERSION` 2 (partidas salvas são rebuscadas uma vez para trazer os cosméticos).
- Removidos `next-themes` e o seletor de tema.
- Desempenho igual ao da v1.3.1 (A/B em build de produção: mediana ~0,27 s com cache vencido; ~0,07 s vindo do banco).

## [1.3.1] — 2026-11-07

### Melhorado
- Páginas mais rápidas (medido em build de produção): jogador buscado na OpenDota 0,92 s → 0,36 s; jogador vindo do banco ~0,16 s → ~0,11 s. A primeira abertura de uma partida também deixa de esperar a gravação do detalhe.
  - As gravações no Supabase rodam com `after()`, depois de a página ser enviada (antes eram 3 gravações em fila segurando a resposta).
  - Perfil e partidas do jogador são lidos do banco ao mesmo tempo, não um depois do outro.

### Técnico
- Testes automatizados com Vitest (`npm test`): 53 testes cobrindo Steam ID, formatação, erros e conversão da OpenDota e todas as decisões do cache (dado novo, vencido, OpenDota fora, banco fora, sem secret key, versão do `detail`).
- `@types/node` 20 → 24 (versão do Node em uso; exigido pelo Vitest).

## [1.3.0] — 2026-11-07

### Adicionado
- Dados da OpenDota guardados no Supabase: heróis, perfil do jogador, últimas partidas e detalhe de cada partida aberta.
- Página do jogador mostra de quando são os dados ("dados de …").
- Se a OpenDota estiver fora e houver dado salvo, a página mostra o dado antigo com um aviso, em vez de erro.

### Técnico
- Migração `supabase/migrations/20261107000000_v1_3_cache.sql`: tabelas `heroes`, `players`, `matches` e `player_matches`. RLS ligado em todas, só com política de leitura pública; sem política de escrita (= negado). O servidor grava com `SUPABASE_SECRET_KEY` (`lib/supabase/admin.ts`, `server-only`).
- `lib/data.ts` concentra a regra de cache: jogador + partidas recentes 10 min, heróis 1 dia, detalhe da partida para sempre (com versão do formato). Falha do banco cai no modo só-API.
- `lib/opendota.ts` deixou de usar `"use cache"` para heróis, jogador e partidas (só a lista de itens continua no cache do Next).
- ESLint ignora `.next/` (o lint estava lendo a saída do build) e `tailwind.config.ts` usa `import` em vez de `require`.

## [1.2.0] — 2026-11-07

### Adicionado
- Botão "Ver partida" em cada linha do histórico → `/match/[id]`.
- Tela da partida: placar, data, duração, os dois times (herói, jogador, K/D/A, itens + neutro) e Vitória/Derrota do jogador buscado, destacado como "(você)".
- Clicar num herói mostra o painel dele: nível, K/D/A, GPM/XPM, last hits/denies, patrimônio, dano em heróis/torres, cura, itens, mochila e neutro.
- Preview dos itens ao passar o mouse (ou focar com Tab): custo, atributos, habilidades, recarga e mana. Texto em inglês (vem assim da OpenDota).
- Título da aba: "Dota Own Coach".

### Técnico
- Partidas em cache por semanas e lista de itens por 1 dia (`"use cache"`); falhas ficam só ~1 min.
- Componentes compartilhados `hero-cell` e `status-message`; tooltip do shadcn (`radix-ui`).

## [1.1.0] — 2026-11-06

### Adicionado
- Histórico mostra imagem e nome do herói (antes só `hero_id`), via `/constants/heroes` da OpenDota com cache de 1 dia.
- Coluna com data e hora da partida (horário de Brasília).
- Botão na home que abre a página de conta da Steam, onde aparece o Steam ID.

## [1.0.0] — 2026-11-06

### Adicionado
- Home com campo de Steam ID (Friend ID ou SteamID64).
- `/player/[id]`: perfil e últimas 20 partidas da OpenDota (resultado, K/D/A, duração, GPM/XPM, last hits).
- Mensagens para ID inválido, jogador inexistente, sem partidas/perfil privado, limite de requisições e OpenDota fora do ar.
