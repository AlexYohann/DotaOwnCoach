# v2.4 — Diário: design

Data: 2026-11-16 · Status: **aguardando aprovação do Alex** (revisão de construtor feita; respostas incorporadas). As escolhas de tela foram do Alex, feitas sobre mockups. As decisões técnicas foram delegadas a mim e estão marcadas. Mockups (não versionados): `.superpowers/brainstorm/50036-1794837904/content/` — `nota-da-partida.html` (escolhida **A**), `resumo-do-mes.html` (escolhida **B**), `perfil-abas.html` e `diario-filtros.html` (aprovados como estão).

Legenda: **[Alex]** = decidido por ele. **[minha escolha]** = decisão minha, que ele pode derrubar ao ler.

## Por quê

O site é um coach. Depois de uma partida, o Alex quer registrar o que deu certo, o que deu errado e que item faltou. Depois de um mês quer **um resumo de tudo o que foi anotado**: o que mais se repete, o que mais deu certo, o que mais deu errado, para melhorar [Alex]. Daí sai o requisito central: **as notas precisam ser somáveis**. Texto livre sozinho não serve, porque "morri na lane" e "fui pego na lane" não se juntam numa contagem. Por isso as notas têm etiquetas, e o texto livre fica como detalhe.

## Objetivos

1. **Nota por partida** na tela da partida, só nas partidas em que você jogou e só visível para você [Alex, mockup A]:
   - dois lados, **"Deu certo"** e **"Deu errado"**, cada um com etiquetas e um texto livre;
   - **"Itens que faltaram"**: escolher um item (com ícone) e escrever o motivo, quantos itens quiser, até 6 [Alex: opção A da sugestão de itens; o limite de 6 é minha escolha];
   - salvar, editar e apagar a nota.
2. **Etiquetas:** uma lista fixa [minha escolha, o Alex não mexeu] — Fase de rotas, Farm, Mortes evitáveis, Posicionamento, Lutas em equipe, Visão, Objetivos, Rotações — mais **etiquetas próprias** criadas pelo usuário, que entram no resumo do mesmo jeito.
3. **Perfil com abas** [Alex]: na página do jogador, abaixo do banner, as abas **"Últimas partidas"** (a principal), **"Quem joga comigo"** (em outro jogador: "Quem joga com {nome}") e **"Diário"** (só na sua página e só para você). **A seção de parceiros da v2.3 sai da tela de partidas** e vira a aba.
4. **Menu do avatar** com os atalhos **"Meu diário"** e **"Quem joga comigo"** [Alex].
5. **Tabela de "Últimas partidas"** (só na sua página, só para você): partida com nota mostra 📝 e as etiquetas marcadas; partida sem nota mostra "+ anotar", que leva à partida já na nota [mockup aprovado].
6. **Aba Diário = resumo** [Alex, mockup B + filtros]. O cabeçalho mostra "N partidas anotadas · xV yD", **sem** o "de 41 jogadas" do mockup [minha escolha, resposta à revisão]: o total jogado no período exigiria outra chamada à OpenDota (`/wl`), que é lenta e instável como a de parceiros.
   - **"Mais deu errado"** e **"Mais deu certo"**: cada etiqueta com "em N de M partidas anotadas" e a taxa de vitória nessas partidas, uma barra proporcional e os seus textos daquele lado nessas partidas (do mais recente para o mais antigo);
   - **"Itens que mais faltaram"**: item, quantas vezes e os motivos;
   - **setas de evolução** em relação ao período anterior de mesmo tamanho (▼ menos, ▲ mais, = igual, "novo" se não aparecia antes);
   - **filtros:** período (7 dias, 30 dias, 90 dias, Tudo; padrão 30 dias), **herói** (só os heróis que têm nota, com a contagem; padrão Todos) e **"Escolher partidas…"** (lista das partidas anotadas com caixas de marcar). Período e herói se combinam. Com partidas escolhidas a dedo, o período e o herói são ignorados e **não há setas**. Em "Tudo" também não há setas. "Limpar" volta ao período.

## Não-objetivos

- O site sugerir itens sozinho, olhando os heróis inimigos (opção B da sugestão de itens) — **o Alex gostou e fica para uma versão futura**; anotar no roteiro.
- Resumo escrito por IA a partir dos textos.
- Notas em partidas em que você não jogou (por exemplo, partidas de pro estudadas).
- Notas públicas ou compartilhadas (a revisão pela comunidade é a v5).
- Exportar notas.

## Antiobjetivos

- **Alguém ler ou alterar a nota de outra pessoa.** Este é o teste obrigatório do roteiro.
- A tela de partidas ficar mais poluída do que hoje (o motivo das abas).
- A página do jogador ficar mais lenta.

## Abordagens consideradas

**Gravação das notas** [minha escolha]:
1. Só o servidor grava, com a secret key, e o RLS libera apenas a leitura da própria nota. É o padrão do projeto, mas a regra "cada um edita só a sua" fica só no nosso código.
2. **Escolhida:** o servidor grava **com a sessão do usuário** (cliente de cookies de `lib/supabase/server.ts`) e o RLS confere o dono em SELECT, INSERT, UPDATE e DELETE. São duas camadas: mesmo com um erro no código, o banco recusa a nota de outra pessoa. Quem chamar a API REST direto com a própria sessão consegue gravar uma nota numa partida que não jogou, ou com herói e resultado errados. Isso só afeta o próprio resumo, então é aceito.

**Abas** [minha escolha]:
1. **Escolhida:** rotas aninhadas `/player/[id]` (partidas), `/player/[id]/parceiros` e `/player/[id]/diario`, com o banner e as abas num `layout.tsx` comum. Cada aba carrega só os próprios dados, e a busca de parceiros só acontece na aba dela.
2. `?aba=` numa página só — descartada: recarrega tudo a cada troca de aba e mistura os dados das três abas num componente.

**Resumo** [minha escolha]: calculado no servidor por **funções puras em TypeScript** (testáveis), a partir de todas as notas do usuário lidas de uma vez (são no máximo algumas centenas). A agregação em SQL foi descartada por ser mais difícil de testar e desnecessária nesse volume. Os filtros ficam na URL (`?periodo=7|30|90|tudo&heroi=<hero_id>&partidas=<id,id,…>`), então a página é renderizada no servidor e um filtro pode ser salvo ou compartilhado.

## Dados

**Tabela `match_notes`** [minha escolha] — uma nota por usuário por partida:
- `user_id uuid` → `auth.users(id)` on delete cascade; `match_id bigint`; **PK (`user_id`, `match_id`)**;
- `account_id bigint` (a conta Steam do autor), `hero_id integer`, `won boolean` (null = resultado indefinido) e `played_at timestamptz`. Esses quatro campos são **copiados da partida no momento de salvar**, para o resumo não depender do cache de partidas nem de joins;
- `good_tags text[]`, `bad_tags text[]`, `good_text text`, `bad_text text`;
- `missing_items jsonb` — lista de `{ "item_id": number, "reason": string }`;
- `created_at`, `updated_at`;
- **limites no banco (check constraints):** cada texto com até 2.000 caracteres; até 12 etiquetas por lado, cada uma com 1 a 30 caracteres; até 6 itens, motivo com até 300 caracteres; os quatro campos de conteúdo não podem estar todos vazios junto com a lista de itens (nota vazia = apagar).

**RLS** (cada política explicada na migração):
- SELECT, UPDATE e DELETE: `user_id = auth.uid()`;
- INSERT com `with check (user_id = auth.uid() and account_id = (select account_id from profiles where id = auth.uid()))`;
- UPDATE com o mesmo `with check`, para ninguém trocar o dono nem a conta;
- **nada para `anon`.** É a primeira tabela com dado privado escrito pelo usuário. Os índices: o da PK, mais `(user_id, played_at desc)`.

**Etiquetas:** as fixas guardadas pelo **rótulo** exibido ("Mortes evitáveis"). As próprias são normalizadas: espaços aparados e colapsados, 1 a 30 caracteres. A mesma etiqueta não pode estar nos dois lados da mesma nota: marcar de um lado tira do outro.
- **Etiquetas próprias reaparecem como opção** nas próximas notas [minha escolha, resposta à revisão]. Sem isso o usuário redigitaria, erraria a grafia e o resumo deixaria de somar. Não há tabela nova: a página da partida lê as etiquetas distintas das notas do usuário (a mesma leitura que já entrega a nota daquela partida).
- **Grafia única, aplicada ao salvar:** duas etiquetas são iguais se coincidem ignorando maiúsculas e acentos. No `PUT`, uma etiqueta digitada que bate com uma existente nas notas do usuário é gravada com a grafia **já existente** (a da nota de `created_at` mais antigo). As fixas sempre vencem as próprias.
- Não dá para renomear nem apagar etiqueta própria na v2.4: ela some das opções quando nenhuma nota a usa mais.

## Fluxos

**Salvar a nota:** `PUT /match/[id]/note` (corpo JSON) e `DELETE /match/[id]/note`.
1. Sem sessão → 401.
2. `account_id` vem dos claims (`accountIdFromClaims`), nunca do corpo.
3. Detalhe da partida via `getMatchData`: a conta tem que estar entre os 10 jogadores (senão 403). Daí saem `hero_id`, `won` (`isWin`) e `played_at`.
4. Validação e normalização do corpo numa função pura (`lib/diary.ts`). Item precisa existir no mapa de itens. Erro → 400 com a mensagem.
5. Upsert com o **cliente da sessão** (RLS). Erro do banco → 500 sem detalhes.

**Ler a própria nota na partida:** a página da partida, se o visitante jogou a partida, lê a nota com o cliente da sessão e entrega ao editor. Partida que o visitante não jogou → nenhum editor e nenhuma leitura.

**Tela da partida:** o editor fica abaixo do painel do herói, recolhido se não houver nota ("📝 Anotar esta partida"), aberto se houver nota ou se a URL tiver `#nota` (o "+ anotar" da tabela usa `/match/<id>?player=<conta>#nota`).

**Tabela de partidas:** na sua página e para você, as notas das 20 partidas vêm de uma leitura extra em paralelo (cliente da sessão, `match_id in (…)`). Visitantes e outras páginas não fazem essa leitura.

**Aba Diário:** só existe se o visitante logado é o dono da página. Outro visitante que abrir `/player/<id>/diario` → 404. Lê todas as notas do usuário (limite de 2.000) e calcula com `summarize(notes, filtro, agora)`.

**Aba "Quem joga comigo":** é a seção da v2.3 movida, sem mudança de regra.

## Funções puras (`lib/diary.ts`, sem `server-only`)

- `DEFAULT_TAGS`, `normalizeTag`, `sameTag`;
- `parseNoteInput(raw, items) → { ok: true, note } | { ok: false, error }`;
- `filterNotes(notes, filtro, agora)` e `previousWindow(filtro, agora)`;
- `summarize(notes, prevNotes | null) → { total, wins, losses, bad: TagStat[], good: TagStat[], items: ItemStat[] }`, em que `TagStat = { tag, count, wins, games, trend: "up" | "down" | "same" | "new" | null, texts: {matchId, heroId, won, playedAt, text}[] }`;
- **ordenação** por contagem (desc), com empate desfeito pela mais recente;
- **setas comparam a fração** (`count/total`), não o número bruto, porque os períodos podem ter quantidades diferentes de notas anotadas. **Tolerância de 5 pontos percentuais:** diferença menor que isso é "=" [minha escolha, resposta à revisão — sem tolerância a seta trocaria de lado com uma partida de diferença]. "novo" = a etiqueta não aparecia no período anterior. Sem setas quando o período anterior tem menos de 3 notas (amostra pequena demais). O texto da seta mostra o antes ("antes 18 de 26"). "▼" no "deu errado" é bom (verde); "▲" no "deu errado" é ruim (vermelho); no "deu certo" é o contrário.
- O filtro de herói vale também para o período anterior. Notas com `won` nulo ficam fora da taxa de vitória (mas contam nas ocorrências). Um `PUT` com a nota vazia apaga a nota. `?partidas=` aceita até 100 IDs; o resto é ignorado.

## Pronto quando

1. **Duas contas:** com duas contas (simuladas no banco com dois `auth.uid()` diferentes, além do teste automático das regras), nenhuma lê, edita ou apaga a nota da outra, e `anon` não lê nada. **Obrigatório.**
2. O Alex anota uma partida dele, a nota aparece na tabela com 📝 e as etiquetas, e entra no resumo.
3. O resumo de 30 dias, filtrado por herói e por partidas escolhidas, bate com uma contagem feita à mão sobre notas de teste.
4. A tela de partidas não tem mais a seção de parceiros, e a aba de parceiros funciona como na v2.3.
5. A página do jogador não fica mais lenta (medir em `next start` e em produção). 390 px sem vazar.

## Para quem for construir

Textos exatos, espaçamento, ícones, o esqueleto de carregamento das abas e o componente de escolha de item (busca pelo nome sobre o mapa de itens da partida) ficam a critério de quem constrói, seguindo a paleta existente e os mockups.
