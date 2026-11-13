# v2.2 — Linha do tempo do herói: design

Data: 2026-11-13 · Status: **aguardando aprovação do Alex**. Mockup de referência (não versionado, interativo, com dados reais): `.superpowers/brainstorm/20765-1794585467/content/linha-do-tempo.html` — escolhida a opção **B**.

Legenda: **[Alex]** = decidido por ele no brainstorm. **[minha escolha]** = decisão minha, que ele pode derrubar ao ler.

## Por quê

O site é um "coach". Hoje a tela da partida mostra só o resultado final: GPM, XPM e os itens no fim. Para estudar o jogo o Alex quer ver **o caminho**: como o herói estava em cada minuto e quanto cada item grande acelerou o farm. Exemplo dele: dois jogos de Anti-Mage, um fechando Battle Fury e outro Mjollnir — em qual o ouro por minuto subiu mais depois do item? É para estudar builds e metas novas.

## Objetivos

1. **Barra deslizante com o tempo da partida** no painel do herói selecionado [Alex]. A pessoa escolhe um minuto e vê os números do herói naquele minuto.
2. **Dois números para ouro e dois para XP** em cada minuto [Alex concordou]:
   - **ritmo**: quanto o herói ganhou por minuto nos últimos 3 minutos — é o que mostra o efeito de um item;
   - **até aqui**: a média desde o começo, que é o GPM/XPM que o Dota mostra.
3. **Gráfico do ritmo ao longo da partida, atrás da barra, com os itens grandes marcados** na hora em que foram fechados [Alex escolheu esta forma entre três].
4. **Ícone do item** como marcador, não o nome [Alex].
5. **"Fechados até aqui"**: os ícones dos itens grandes já fechados no minuto escolhido [Alex aceitou no lugar do inventário exato].
6. **Pedir o processamento da partida sozinho** quando alguém abre uma partida ainda não processada, e **avisar na própria tela** quando ficar pronto [Alex].

## Não-objetivos

- **Inventário exato minuto a minuto.** A OpenDota registra compras, não vendas: a reconstrução deixava Magic Wand, Bracer e Quelling Blade aparecendo depois de vendidos (conferido em 2 partidas) [Alex aceitou].
- **Comparar duas partidas lado a lado.** A comparação é a pessoa que faz, abrindo uma partida de cada vez [Alex].
- Aviso fora do site (e-mail, notificação) quando o processamento termina [minha escolha].
- Curvas de last hits/denies, marcadores de abates e lutas, patrimônio. Os dados existem (`lh_t`, `kills_log`); ficam para depois.
- Pedir processamento a partir da lista de partidas do jogador. Só ao abrir a partida.

## Anti-objetivos (falha mesmo que "funcione")

- **Esgotar o limite gratuito da OpenDota.** Cada pedido de processamento pesa como 10 chamadas; o limite medido é 60 por minuto e ~3.000 por dia, dividido com o resto do site. Se alguém conseguir gastar isso abrindo partidas em série, o site inteiro para.
- **A tela da partida ficar mais lenta** ou esperar pelo processamento. A página responde como hoje; a linha do tempo chega depois.
- **Pedir o processamento da mesma partida mais de uma vez**, ou ficar consultando para sempre uma partida cujo replay não existe mais.
- **Número apresentado como exato sem ser.** O ritmo é uma média de 3 minutos e a hora de cada item vale "comprado em", não "no inventário".
- Mostrar a seção quebrada ou vazia em partida não processada, sem dizer por quê.

## Restrições

- As regras do `CLAUDE.md` do repo: OpenDota só no servidor e só em `lib/opendota.ts`; gravações disparadas por página dentro de `after()`; nenhum segredo no cliente; tabela/coluna nova com RLS explicado; `cacheComponents` (dados de request dentro de `<Suspense>`); tema escuro e cores do projeto; textos em português.
- Sem biblioteca de gráficos nova [minha escolha]: a curva é um SVG desenhado à mão (são ~50 pontos).
- Um eixo por gráfico. Ouro e XP não dividem o mesmo gráfico; a curva alterna por um botão.

## Dados conferidos na OpenDota (2026-11-13)

- Por jogador, em partida processada: `gold_t[]` e `xp_t[]` (acumulado, um valor por minuto, índice 0 = minuto 0) e `purchase_log[]` (`{ time, key }`, `time` em segundos, negativo antes do sino; inclui componentes, receitas e consumíveis). `version != null` na partida = processada.
- Conferência à mão na partida `9070527945`, Anti-Mage do Yatoro (47 min): Battle Fury aos 12:36; no minuto 16, ritmo de ouro 785, GPM até ali 523, ritmo de XP 1.019, XPM até ali 516. O GPM final calculado por `gold_t` (1133 numa outra partida) difere um pouco do `gold_per_min` da API (1091): os números da linha do tempo vêm só de `gold_t`/`xp_t` e não precisam bater com o GPM final do cabeçalho.
- `POST /request/{match_id}` pede o processamento; "conta como 10 chamadas" (texto da própria API). `GET /request/{jobId}` devolve o estado do pedido. Em 2026-11-08 um pedido levou segundos. **Não medido:** o formato exato das duas respostas e até que idade de partida o pedido funciona (o replay some da Valve depois de algumas semanas) — ver "A medir antes de implementar".
- Das 20 partidas recentes do Alex, 3 estavam processadas. Partidas de profissionais quase sempre estão.

## Como funciona

### 1. Dados da partida (`lib/opendota.ts`, `lib/data.ts`)

- `MatchDetail` ganha `parsed: boolean` (`version != null`).
- `MatchPlayer` ganha `timeline: { gold: number[]; xp: number[]; purchases: { time: number; key: string }[] } | null` — `null` quando a partida não está processada ou o jogador não tem os campos. `purchases` guarda as compras sem as receitas (`recipe_*`); o filtro de "item grande" é feito na hora de mostrar, para a regra poder mudar sem buscar tudo de novo [minha escolha].
- Valores estranhos (não-número, lista de tamanhos diferentes) → `timeline: null` para aquele jogador, sem derrubar a partida.
- `DETAIL_VERSION` 4.
- **Regra de cache nova.** Hoje o detalhe é "para sempre". Passa a ser: detalhe **processado** = para sempre; detalhe **não processado** = servido do banco como hoje, e só é buscado de novo pelo fluxo de processamento (item 3). Abrir a página nunca refaz a busca sozinho.
- A lista de itens (`getItems`) passa a trazer o que a regra de "item grande" precisa: a chave do item (`key`, ex.: `bfury`) e se ele é montado (tem `components`).

### 2. Regras puras (`lib/timeline.ts`, testadas)

- `rhythm(series, minute)`: `(series[m] − series[max(0, m−3)]) / min(3, m)`, arredondado; minuto 0 → 0.
- `averageSoFar(series, minute)`: `series[m] / m`, arredondado; minuto 0 → 0.
- `bigPurchases(purchases, items)`: **item grande = item montado que custa 2.000 de ouro ou mais**, comprado depois do minuto 0 [minha escolha]. Entram Battle Fury, Maelstrom, Yasha, Manta, BKB; ficam fora Power Treads e Perseverance. Intermediários (Yasha antes da Manta, Maelstrom antes do Mjollnir) **aparecem**: o Maelstrom acelera o farm bem antes de virar Mjollnir.
- `beforeAfter(series, purchaseTime)`: ritmo no minuto da compra e 3 minutos depois (limitado ao fim da partida) — o "antes → depois" do ícone.
- Escala do eixo (teto redondo) e a distribuição dos ícones em duas fileiras quando ficam próximos.

### 3. Processamento sob demanda

Coluna nova em `matches`: `parse_requested_at timestamptz` (quando o site pediu o processamento; `null` = nunca pediu). RLS não muda: `matches` continua com leitura pública e nenhuma política de escrita; a coluna nova não revela nada sensível.

Rota `app/match/[id]/parse/route.ts` (pública, como `/match`):

- **`POST`** — chamada pela tela quando a partida aberta não está processada. Faz, nesta ordem, e para no primeiro "não":
  1. a partida existe no nosso banco com detalhe não processado (ou seja, alguém abriu a página; ninguém pede processamento de um ID qualquer);
  2. a partida é recente o bastante (limite de idade: ver "A medir");
  3. **reserva**: `UPDATE matches SET parse_requested_at = now() WHERE match_id = … AND parse_requested_at IS NULL` — só passa uma vez por partida, mesmo com duas abas;
  4. **teto diário**: no máximo **50 pedidos em 24 h** no site inteiro [minha escolha]. Conta do pior caso: cada partida custa 10 chamadas do pedido + até 12 consultas de acompanhamento = 22; 50 × 22 = 1.100 das ~3.000 chamadas diárias, sobrando folga para o resto do site. A contagem usa `parse_requested_at`.
  5. `POST /request/{match_id}` na OpenDota.
  Resposta: `{ status: "requested" | "already" | "too_old" | "limit" | "unavailable" }`. Se o passo 5 falhar, a reserva **fica** (não tenta de novo sozinho) [minha escolha: protege o limite; custo: aquela partida fica sem linha do tempo].
- **`GET`** — a tela consulta a cada 8 s, no máximo 12 vezes (~1 min e meio), enquanto mostra "Analisando o replay…". O servidor busca a partida na OpenDota; se voltou processada, **grava o detalhe novo antes de responder** (aqui não é `after()`: a tela vai ler o banco em seguida) e responde `{ status: "ready" }`; senão `{ status: "pending" }`. Só consulta a OpenDota para partidas com `parse_requested_at` preenchido há menos de 10 minutos; fora disso, `{ status: "expired" }` sem chamar a OpenDota.
- Quando chega `ready`, a tela chama `router.refresh()` e a linha do tempo aparece sem recarregar.
- `POST` que responde `already` com pedido feito há menos de 10 minutos (outra aba, ou a página recarregada): a tela acompanha do mesmo jeito. `already` com pedido antigo: mensagem "Não foi possível analisar esta partida", sem consultar.
- Qualquer visitante dispara o pedido, logado ou não [minha escolha]; quem protege o limite são a reserva, a idade e o teto.

O que a pessoa vê no lugar da linha do tempo:

| Situação | Texto |
|---|---|
| pedido feito, aguardando | "Analisando o replay desta partida… Costuma levar menos de um minuto. A linha do tempo aparece aqui sozinha." |
| passou do tempo de espera | "A análise ainda não terminou. Volte daqui a pouco: quando ficar pronta, a linha do tempo aparece aqui." |
| partida antiga | "Linha do tempo indisponível: o replay desta partida não existe mais." |
| teto diário | "Muitas análises pedidas hoje. Tente de novo amanhã." |
| pedido já feito antes e não processou | "Não foi possível analisar esta partida." |

### 4. A tela (`components/match-timeline.tsx`, cliente; dentro do painel do herói em `match-view.tsx`)

Posição: no painel do herói selecionado, entre os números (nível, GPM/XPM…) e as listas de itens. Segue o mockup B:

```
LINHA DO TEMPO
MINUTO   ▬ RITMO DE OURO (ÚLTIMOS 3 MIN)   ▬ RITMO DE XP (ÚLTIMOS 3 MIN)
16:00    785 por min                       1.019 por min
         GPM até aqui: 523                 XPM até aqui: 516
FECHADOS ATÉ AQUI  [BF] [Yasha]

        [BF][Yasha] [Manta]   [Bfly]  [BKB] …        ← ícones na hora da compra
▬ Ritmo de ouro por minuto                  [Ouro | XP]
1.500 ┤            ╭─╮      ╭──╮
1.000 ┤      ╭─●──╯  ╰──╮╭─╯   ╰╮
  500 ┤ ╭───╯            ╰╯
    0 ┼────┬────┬────┬────┬────┬
      0    10   20   30   40 min
──────────●──────────────────────                    ← barra
```

- **Leitura do minuto**: minuto escolhido; para ouro e XP, o ritmo em destaque e o "até aqui" embaixo; "Fechados até aqui" com os ícones (ou "nenhum item grande ainda").
- **Ícones**: um por item grande, alinhado ao horário da compra, com uma linha pontilhada até o gráfico. Apagado = ainda não fechado no minuto escolhido. Passar o mouse/focar: nome, horário, custo e "Ritmo de ouro: X antes → Y três minutos depois". Clicar: leva a barra para aquele minuto. Ícones próximos sobem para uma segunda fileira.
- **Gráfico**: uma curva (linha de 2 px + área suave), eixo com poucas marcas, minutos de 5 em 5. Botão **Ouro | XP** troca a curva; os quatro números continuam no topo. Cores conferidas contra o fundo do painel (contraste e daltonismo): ouro `#b98a2b`, XP `#4a94d8`. Números e rótulos em texto normal, nunca na cor da curva.
- **Interação**: barra nativa (`<input type="range">`, funciona no teclado e no toque); arrastar no próprio gráfico também move; passar o mouse mostra o valor do minuto sob o cursor.
- **Minuto inicial**: o do primeiro item grande; sem item grande, minuto 10 (ou o último, em partida curta) [minha escolha].
- **Trocar de herói mantém o minuto** [minha escolha]: dá para ver o carry inimigo no mesmo minuto.
- **Tabela para leitor de tela e para conferir** [minha escolha]: um "Ver itens em tabela" recolhido, com item, horário e ritmo antes → depois.
- **Lone Druid**: as compras são do jogador, então os itens do urso entram normalmente.
- **Celular (390 px)**: tudo na largura da tela, sem rolagem lateral; os números quebram em linhas.

### 5. Roteiro

Esta versão vira a **v2.2**. "Quem joga comigo" passa a v2.3 e o diário a v2.4 [minha escolha — o roteiro é do Alex]. O pedido automático de processamento, que estava anotado para a v3, entra aqui.

## Abordagens consideradas

1. **Só a barra**, com os números mudando. Mais simples; para ver o efeito de um item é preciso arrastar para lá e para cá e guardar os números de cabeça.
2. **Barra sobre um gráfico do ritmo, com os itens marcados** — **escolhida pelo Alex**. O efeito de um item é uma mudança ao longo do tempo; a curva mostra de relance e a barra dá o número exato.
3. **Sem barra: lista dos itens com antes → depois.** Mais barata e responde direto, mas não deixa explorar a partida. O "antes → depois" foi aproveitado no ícone de cada item.

Dentro da 2, dois layouts no mockup: **A** dois gráficos empilhados (ouro e XP) e **B** um gráfico maior com botão Ouro/XP. O Alex escolheu **B**.

## Testes

- `lib/timeline.ts`: ritmo e média nos minutos 0, 1, 2, 3 e no último; os números da partida `9070527945` no minuto 16; item grande (limite de 2.000, montado, receitas e consumíveis fora, compra antes do minuto 0 fora); antes → depois no fim da partida; fileiras dos ícones.
- `lib/opendota.ts`: partida processada → `parsed` e `timeline`; não processada → `timeline: null`; campos estranhos não derrubam; `POST /request`.
- `lib/data.ts`: detalhe processado não busca de novo; detalhe não processado é servido do banco sem buscar; versão antiga busca de novo.
- Rota de processamento: cada uma das cinco guardas (partida desconhecida, antiga, já pedida, teto, falha da OpenDota); duas chamadas simultâneas → um pedido só; `GET` fora da janela não chama a OpenDota.

## Pronto quando

1. Abrir uma partida de profissional (processada) mostra a linha do tempo; na `9070527945`, Anti-Mage, minuto 16: ouro 785 / GPM 523 / XP 1.019 / XPM 516, e o ícone da Battle Fury aos 12:36.
2. Abrir uma partida recente do Alex não processada mostra "Analisando o replay…" e a linha do tempo aparece sozinha; no banco, `parse_requested_at` preenchido; abrir de novo não gera outro `POST`.
3. Partida antiga mostra a mensagem de replay inexistente e nenhum `POST`.
4. Recarregar 3 vezes uma partida processada não gera `[OpenDota] GET` no log.
5. Tempo de `/match` aquecido igual ao da v2.1 (~0,1–0,4 s), medido em `next start`.
6. Celular (390 px) sem rolagem lateral; a barra funciona pelo teclado.
7. Com o teto diário em 0 (em teste), aparece a mensagem do teto e nenhum `POST`.

## Entrega

Branch `v2.2`, preview conferido pelo Alex antes do merge, versão `2.2.0` (`package.json`, `CHANGELOG.md`, tag). README (roteiro renumerado) e `CLAUDE.md` atualizados. Migração aplicada pelo MCP, com o `.sql` em `supabase/migrations/`.

## A medir antes de implementar

Precisa de 2 ou 3 pedidos reais de processamento em partidas do Alex (cada um pesa 10 chamadas), com o ok dele:

1. O formato das respostas de `POST /request/{id}` e `GET /request/{jobId}`.
2. Quanto tempo leva hoje.
3. **Até que idade de partida funciona.** Define o limite de idade da guarda 2. Enquanto não for medido, o padrão é **14 dias** [minha escolha, chute a confirmar].

## Fica para quem implementa

- Se o `GET` da rota consulta `GET /request/{jobId}` (mais leve) ou a própria partida, conforme o que a medição mostrar.
- Onde guardar o `jobId`, se for usado.
- Detalhes de desenho do SVG, do tooltip e da quebra em telas estreitas, seguindo o mockup.
- Se a seção fica recolhível no painel.
