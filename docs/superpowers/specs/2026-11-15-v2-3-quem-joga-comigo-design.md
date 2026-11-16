# v2.3 — Quem joga comigo: design

Data: 2026-11-15 · Status: **delegado pelo Alex** ("É isso mesmo que você descreveu e pensou. Pode iniciar o brainstorm se necessário e iniciar a implantação") antes de uma viagem de ~10 h. As decisões técnicas e de tela marcadas como **[minha escolha]** são minhas e ficam para ele conferir na volta. Não houve mockup no navegador: o esboço em texto está mais abaixo, e a tela foi conferida no Chrome durante a implementação.

Legenda: **[Alex]** = dito por ele. **[minha escolha]** = decisão minha, que ele pode derrubar ao ler.

## Por quê

Ideia original do Alex, "partidas de amigos": ver com quem a pessoa joga e como se sai junto com cada um. O site já mostra as últimas 20 partidas, mas essas partidas não dizem quem estava no grupo. A OpenDota soma isso no histórico inteiro (`/players/{id}/peers`). Na conversa de 2026-11-14 o Alex confirmou as duas leituras [Alex]:

1. **ranking**: com quem eu mais jogo e quantas ganhamos juntos;
2. **atalho**: chegar às partidas recentes de um amigo. O próprio ranking resolve isso, porque cada nome leva a `/player/<id>`.

## O que a OpenDota entrega (conferido em 2026-11-14/15)

- Uma lista com até ~200 pessoas e o **histórico inteiro**. Na conta testada, 110 tinham 5 ou mais partidas juntos.
- Cada pessoa vem com: `with_games`/`with_win` (mesmo time), `against_games`/`against_win` (times opostos; vitória = do jogador consultado), `last_played` (unix, última partida em comum, juntos OU contra), `personaname` e `avatar`.
- **Ordenando só por partidas juntos, os primeiros eram amigos de anos atrás** (última vez em 2024 e em 2019).
- **Lento e instável.** Em 2026-11-15, `/peers` levou **43–46 s** (com e sem `?date=`) e depois passou a dar **HTTP 500 após 34–67 s** em três contas diferentes. `/wl` também deu 500 após 34 s. Já o perfil (`/players/{id}`) responde em 0,4 s. Os endpoints que somam o histórico são outro serviço da OpenDota, bem mais frágil. **É isto que define a arquitetura.**

## Objetivos

1. Na página `/player/[id]`, uma seção **"Quem joga com {nome}"** entre o banner e a tabela de partidas [minha escolha: a página do jogador já é "o jogador"; uma rota a mais seria um clique a mais para algo que cabe ali].
2. **Parceiros recentes primeiro.** "Recente" = última partida em comum nos últimos 90 dias, ordenados por partidas juntos. Os antigos ficam numa parte recolhida, "Parceiros antigos (N)" [minha escolha: resolve o problema dos amigos de 2019 no topo sem jogar fora o histórico].
3. Só entra quem tem **3 ou mais partidas juntos** [minha escolha: 1–2 partidas juntos costuma ser desconhecido que caiu no mesmo time].
4. Cada pessoa mostra: avatar, nome (**link para `/player/<id>`**), partidas juntos, vitórias e derrotas juntos (`V`/`D` nas cores de vitória/derrota, como no cartão "Mais jogado") com a porcentagem, partidas contra com as vitórias de quem está sendo visto e "última vez há X".
5. **A página nunca espera a OpenDota por causa dessa lista.** A lista fica no Supabase; vencida ou ausente, a renovação roda em segundo plano e a seção se atualiza sozinha.
6. **Pública**, como o resto da página do jogador [minha escolha: os dados já são públicos na OpenDota e a renovação só começa pelo navegador (JavaScript). Isso afasta robôs simples, mas **não** o Googlebot, que executa JavaScript; por isso há um teto do site inteiro (abaixo). Diferente da linha do tempo, aqui não há um custo de 10 chamadas que justifique exigir login. Se o Alex quiser como "valor a mais para logados", basta trocar a seção por um convite, como fizemos na v2.2].

## Não-objetivos

- Lista de amigos da Steam (exigiria chave da API e lista pública) — já decidido no roteiro.
- Filtros (período, modo de jogo, herói) e gráficos por parceiro.
- Selo de pro verificado nos parceiros (`getVerifiedPro` existe; fica para depois).
- OPM/XPM médio juntos (`with_gpm_sum`): não ficou claro de quem é a média e a tela fica mais carregada.
- Comparar com a taxa de vitória geral do jogador: viria de `/wl`, que está tão instável quanto `/peers`.

## Antiobjetivos (falharia mesmo "funcionando")

- A página do jogador ficar mais lenta, ou quebrar quando a OpenDota estiver fora.
- Cada visita a uma página de jogador gastar uma chamada lenta da OpenDota.
- Desconhecidos de uma partida só aparecendo como "parceiros".

## Esboço da tela

```
QUEM JOGA COM ALEX                                   dados de 15/11 09:40
┌────────────────────────────────┐ ┌────────────────────────────────┐
│ [av] Cr1t-                     │ │ [av] z                         │
│ 1.375 juntos · 853V 522D · 62% │ │ 851 juntos · 555V 296D · 65%   │
│ 96 contra (48V) · há 3 dias    │ │ 215 contra (124V) · há 8 dias  │
└────────────────────────────────┘ └────────────────────────────────┘
▸ Parceiros antigos (37)
```
Grade com 1 coluna no celular, 2 a partir de `sm` e 3 a partir de `lg`. Estados:
- buscando pela primeira vez: "Buscando quem joga com {nome} na OpenDota… pode levar até um minuto.";
- renovando com lista antiga: a lista antiga aparece, com "atualizando…" no lugar da data;
- OpenDota fora: "A OpenDota não entregou a lista agora. Tente de novo mais tarde." (com a lista antiga, se houver, e a data dela);
- ninguém com 3 ou mais: "Ninguém jogou 3 ou mais partidas junto com {nome}.".

## Abordagens consideradas

1. **Chamar `/peers` na própria renderização da página** — descartada: 45 s de espera ou erro 500 derrubariam ou travariam a página inteira.
2. **Montar a lista com as partidas já guardadas no banco** (`matches.detail` das partidas abertas) — descartada: só temos o detalhe das partidas que alguém abriu, então a lista sairia quase vazia e errada.
3. **Banco + renovação em segundo plano + a seção pergunta até ficar pronta** — **escolhida** [minha escolha]. É o mesmo padrão que já funciona no pedido de análise da linha do tempo (`/match/[id]/parse` + `MatchTimelineGate`).

## Como funciona

**Tabela `player_peers`** (migração `20261115000000_v2_3_player_peers.sql`):
- `account_id bigint primary key references players(account_id) on delete cascade`. A chave estrangeira garante que só se busca parceiros de contas que a página do jogador já carregou, ou seja, IDs que existem;
- `peers jsonb` (null até a primeira busca dar certo), `fetched_at timestamptz` (quando a lista foi buscada), `refresh_started_at timestamptz` (o pedido em andamento), `refresh_failed_at timestamptz` (a última falha);
- RLS ligado, **uma política de SELECT pública** (dados públicos na OpenDota, como `players`), **nenhuma de escrita**. Só o servidor grava, com a secret key.

**Regras (puras, em `lib/peers.ts`, testadas):**
- `selectPeers(raw)`: só quem tem `with_games ≥ 3`; ordena por partidas juntos (empate: o mais recente primeiro); guarda no máximo 60.
- `splitPeers(peers, now)`: recentes (`last_played` ≤ 90 dias) e antigos.
- `peersState(row, now)`:
  - `ready` = `fetched_at` com menos de 12 h [minha escolha: parceiros mudam devagar; com isso cada conta custa no máximo 2 chamadas por dia];
  - `refreshing` = pedido começou há menos de 2 min (o tempo máximo da chamada mais uma folga) e não falhou depois;
  - `failed` = falhou há menos de 10 min. Não tenta de novo antes disso, para não insistir com a OpenDota fora;
  - `start` = qualquer outro caso: pode pedir.
- Rótulo "há X" compartilhado com o `lastPlayedLabel` dos pros (função comum de dias → texto).

**Fluxo:**
1. A página do jogador lê a linha de `player_peers` junto com as outras leituras (em paralelo, sem custo de tempo) e entrega à seção a lista guardada e o estado. **A página não chama a OpenDota por causa disso nem dispara renovação.**
2. A seção (`components/player-peers.tsx`, cliente), se o estado não é `ready`, chama `GET /player/[id]/peers`. Essa rota lê o estado de novo; se for `start`, responde `refreshing` e, dentro de `after()`: cria a linha se faltar, **reserva com UPDATE condicional** (só uma renovação por conta, mesmo com várias abas), chama a OpenDota (`getPeers`, tempo máximo de 60 s) e grava a lista, ou marca a falha. `maxDuration = 90` na rota.
3. Enquanto a resposta é `refreshing`, a seção pergunta de novo a cada 8 s, no máximo 12 vezes (~1,5 min, o mesmo ritmo do `MatchTimelineGate`). `ready` traz a lista nova. Se acabarem as tentativas, mostra o aviso de demora, mantendo a lista antiga.
4. A rota valida o ID com `toAccountId`. Conta que não está em `players` → `unknown`, e não chama nada.

**Na borda (`lib/opendota.ts`):** `getPeers(accountId)` descarta entradas sem `account_id` positivo ou com números inválidos; nome vira texto ou null; avatar só se for `https`. Lista ausente/estranha = erro (não grava lista vazia por cima de uma boa).

**Custo no limite da OpenDota:** 1 chamada por conta a cada 12 h no máximo (mais 1 a cada 10 min enquanto ela estiver falhando) e só quando alguém abre a página com JavaScript. **Teto do site inteiro (revisão final):** no máximo 5 buscas de parceiros por minuto e 300 por dia, contadas em `peers_refresh_log` (uma linha por reserva, RLS sem política, só a função mexe) dentro da mesma função de reserva, serializada por advisory lock. O limite gratuito da OpenDota é ~60/min e ~3.000/dia, compartilhado com o resto do site (a análise de replay já usa até 30/min e 500/dia). Acima do teto a seção continua "buscando" e tenta de novo nas perguntas seguintes.

**Lista vazia depois de uma cheia** (defeito da OpenDota ou perfil fechado): mantém a cheia por até 7 dias; depois aceita a vazia, para não mostrar para sempre parceiros de quem fechou o perfil.

## Pronto quando

1. Na página do Alex, a seção lista os parceiros com 3 ou mais partidas, recentes primeiro, e os números batem com `/players/{id}/peers` da OpenDota.
2. A página do jogador não fica mais lenta (medir em `next start` e em produção).
3. Segunda visita dentro de 12 h: nenhum `[OpenDota] GET …/peers` no log.
4. Com a OpenDota fora/lenta (testes com `fetch` falso): a página abre normal, a seção mostra o aviso e não tenta de novo antes de 10 min.
5. 390 px sem vazar.

## Para quem for construir

O que fica a critério de quem constrói: textos exatos, espaçamento e o esqueleto de carregamento, seguindo a paleta (`panel`, `line`, `ink`, `ember`, `win`, `loss`) e o `ProAvatar` existente.
