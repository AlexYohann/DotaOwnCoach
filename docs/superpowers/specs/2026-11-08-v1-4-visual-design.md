# v1.4 — Visual: design

Data: 2026-11-08 · Status: **aprovado pelo Alex nas rodadas de mockup**; pendências no fim.
Mockups de referência (não versionados): `.superpowers/brainstorm/` — `home-capa.html`, `jogador-cabecalho-v4.html`, `jogador-fundo-v3.html`, `jogador-lado.html`, `partida-v2.html`.

## Por quê

O site funciona, mas é "preto no branco": a home parece um formulário solto e não passa credibilidade. A meta da v1.4 (README) é: *"você mostraria a página para alguém sem vergonha"*. Referência citada pelo Alex: a capa do Crunchyroll — arte grande e viva atrás, uma única ação na frente.

## Objetivos

- Identidade visual escura e consistente nas três telas (home, jogador, partida).
- Heróis animados (animações oficiais da Valve) como protagonistas visuais.
- Facilitar achar o ID: link direto para o **Código de amigo** da Steam.
- Tela da partida mais rica: dois modos de tabela, ordenação por coluna, cosméticos.

## Não-objetivos

- "Entrar com a Steam" (é login → v2). Só reservar o lugar do botão.
- Herói animado **com os cosméticos** do jogador (ideia futura no README; exige modelos 3D).
- Jogadas históricas em vídeo de fundo (descartado: sem fonte oficial, direitos, peso).
- Mexer nas páginas de auth/template.

## Anti-objetivos (falha mesmo que "funcione")

- Página ficar lenta: hoje carrega em ~0,1–0,4 s em produção (v1.3.1). Animação **nunca** pode atrasar o conteúdo.
- Animação ou arte cobrindo texto/dados (bug visto no mockup: pés do herói sobre a tabela — proibido).
- Cores de lado (Radiant/Dire) confundidas com vitória/derrota.

## Restrições

- Next 16 + `cacheComponents`, Tailwind **v3**, shadcn/ui; regras do `CLAUDE.md` (OpenDota só no servidor, dados via `lib/data.ts`).
- Arte da Valve só por link ao CDN da Steam (`cdn.cloudflare.steamstatic.com`), já liberado em `next.config.ts`. Projeto de fã, sem fins comerciais; rodapé obrigatório **"Projeto de fã, não afiliado à Valve."**
- Testes (`npm test`) cobrindo a lógica nova (ordenação, "mais jogado", lado, cosméticos); tempo medido em `next start` antes/depois.

---

## Sistema visual

| Token | Valor | Uso |
|---|---|---|
| Fundo | `#0b0d10` | página |
| Painel | `#12151a` / borda `#23262c` | cartões, tabelas |
| Texto | `#f2efe8`; secundário `#a39e93` | |
| Destaque ("brasa") | `#e4572e` | botão principal, marca, etiquetas (`ÚLTIMA PARTIDA`), linha selecionada |
| Vitória / Derrota | `#5bbf7f` / `#e0596a` | só resultado |
| Raridade de cosmético | common `#b0c3d9`, uncommon `#5e98d9`, rare `#4b69ff`, mythical `#8847ff`, legendary `#d32ce6`, immortal `#e4ae39`, arcana `#ade55c`, ancient `#eb4b4b` | barra lateral do cosmético |

- Fontes: títulos **Barlow Condensed** 600/700, maiúsculas; texto **Inter**. Via `next/font/google`.
- Lado do jogador (Radiant/Dire) sempre em **texto neutro** (`#d8d3c8`, Barlow Condensed), nunca verde/vermelho.
- Marca: "DOTA **OWN** COACH" (OWN em brasa).
- Rodapé em todas as páginas: "Projeto de fã, não afiliado à Valve."

### Arte

- Animação de herói: `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/<key>.webm` (2–4 MB, fundo transparente). `<key>` = nome interno (ex.: `bloodseeker`, `night_stalker`), derivável da URL da imagem do herói já salva (`.../heroes/<key>.png`).
- Ilustração de fundo: `.../apps/dota2/images/dota_react/home/radiant_dire5.jpg` (~750 KB), `brightness(.28–.3)`, **fixa** (não muda por partida/lado).
- Carregamento: imagem estática do herói (já usada hoje) aparece primeiro; o vídeo entra com fade quando puder tocar. `prefers-reduced-motion` → só imagem estática. Vídeo nunca bloqueia o render (fora do caminho crítico; sem `preload="auto"`).
- Herói sem animação no CDN (ex.: herói recém-lançado, `.webm` com 404) → fica a imagem estática, sem erro visível.
- Toda animação fica **presa no seu bloco** (`overflow:hidden`) e apaga em degradê na base (`mask-image` ~62%→92%) antes de qualquer conteúdo abaixo.

---

## Telas

### Home (`/`) — opção "A, herói ao lado"

- Fundo escuro; animação de **um herói sorteado por visita** à direita (sorteio no cliente, para a home continuar estática/pré-renderizada com `cacheComponents`); degradê da esquerda para o texto nunca ficar sobre a arte.
- Topo: marca à esquerda; "Entrar com a Steam (em breve)" à direita (desabilitado/visual).
- Esquerda: título curto (rascunho: "Suas partidas, sem enrolação."), uma frase do que faz, campo + botão **Buscar** (brasa).
- Placeholder: "Código de amigo (ex.: 105248644)". Continua aceitando SteamID64.
- Ajuda: "Não sabe o seu? **Abrir meu código de amigo na Steam ↗**" → `https://steamcommunity.com/my/friends/add` (nova aba). Substitui o link atual da página de conta.
- Etiqueta discreta com o nome do herói sorteado.

### Jogador (`/player/[id]`)

**Cabeçalho** (largura total, conteúdo com largura máxima):
- Fundo: ilustração Radiant × Dire fixa, escurecida.
- Direita: animação do herói da **última partida**.
- Esquerda, de cima para baixo:
  - Nome do jogador; "ID · últimas 20 partidas · dados de <data>"; aviso "stale" atual se aplicável.
  - Bloco **ÚLTIMA PARTIDA**: nome do herói (grande); linha "**VITÓRIA** · RADIANT · **13 / 4 / 12**" (resultado colorido, lado neutro, K/D/A grande); menor: duração · GPM; botão "Ver partida".
  - Cartão pequeno **MAIS JOGADO**, fixo (não flutuante/arrastável — descartado porque cobriria partidas): imagem do herói, nome, "6 de 20 · 5V 1D".
- Regras: mais jogado = herói com mais partidas nas 20; empate → o jogado mais recentemente. Se for o mesmo da última partida, o cartão aparece assim mesmo.

**Tabela** das 20 partidas: escura; faixa vertical verde/vermelha por linha; colunas atuais + **Lado** (texto neutro); botão "Ver partida".

### Partida (`/match/[id]?player=`)

**Cabeçalho**:
- Fundo: mesma ilustração fixa. Direita: animação do **herói selecionado**; ao trocar de herói, a animação troca com fade (sem piscar; imagem estática enquanto carrega).
- Topo: "← Voltar às partidas de <jogador>" (quando há `?player=`).
- Resumo: "Partida <id> · <data> · <duração>"; linha grande "**VITÓRIA** · RADIANT · 32 × 22" (resultado e lado do jogador buscado; placar de abates Radiant × Dire). Sem `?player=`: mostrar "Radiant venceu"/"Dire venceu" + placar.
- Painel do selecionado: etiqueta "VOCÊ" (jogador buscado) ou "HERÓI SELECIONADO"; nome do herói, jogador · lado; K/D/A grande; estatísticas atuais (nível, GPM/XPM, LH/DN, patrimônio, dano em heróis, dano em torres, cura); itens (6) | mochila (3, menores) | neutro (redondo), com o preview de hover que já existe.
- **Cosméticos** (novo): lista com ícone, nome e barra na cor da raridade. Só existe em partidas processadas pela OpenDota (`players[].cosmetics`); sem dados → "Sem cosméticos registrados nesta partida." Ícone ausente → placeholder neutro (visto: 3 de 6 do Lycan sem imagem).

**Times** — alternância **Empilhados | Lado a lado**, lembrada no navegador (`localStorage`); padrão "Empilhados".
- **Empilhados (completo)**: por time, cabeçalho "RADIANT · venceu" + "patrimônio total · dano em heróis total"; colunas: Herói, Jogador, Nív., K/D/A, LH/DN, GPM/XPM, Patrimônio, Dano heróis, Dano torres, Itens · mochila · neutro.
- **Lado a lado (minimalista)**: Radiant e Dire lado a lado; colunas Herói (+ "(você)"), K/D/A, Itens.
- Linha selecionada: fundo + barra em brasa à esquerda; clique na linha ou no botão do herói seleciona (teclado continua funcionando).
- **Ordenação por coluna** (nos dois modos, colunas numéricas): clicar no cabeçalho ordena **dentro de cada time**: 1º clique = maior primeiro, 2º = menor primeiro, 3º = volta à ordem original (posição no time). Indicador ▼/▲ no cabeçalho; `aria-sort`. K/D/A ordena por abates; LH/DN por last hits; GPM/XPM por GPM.

### Celular (decisão do construtor, com estas diretrizes)

- Herói passa para trás do texto, bem apagado (não há espaço lateral); texto sempre legível.
- "Lado a lado" vira um time abaixo do outro; tabela completa rola na horizontal.
- Em conexão econômica (`navigator.connection.saveData`) ou telas pequenas, pode usar só a imagem estática.

---

## Dados (impacto técnico)

- **Cosméticos**: ampliar `MatchDetail` com `cosmetics: {name, rarity, image}[]` por jogador (copiar só esses campos) → **subir `DETAIL_VERSION`** em `lib/data.ts` (partidas salvas são rebuscadas uma vez). URL do ícone: `https://cdn.cloudflare.steamstatic.com/apps/570/<image_path>`.
- **Mais jogado / última partida / lado**: tudo deriva das 20 partidas recentes já carregadas (`player_slot < 128` = Radiant). Funções puras + testes.
- Nenhuma tabela nova; nenhuma chamada nova à OpenDota fora a rebusca única do `detail`.

## Decisões minhas (o Alex pode revisar)

- Paleta, fontes e o texto de título da home são propostas minhas; o Alex não objetou nos mockups.
- Cartão "mais jogado" aparece mesmo quando é o mesmo herói da última partida; empate → mais recente.
- Coluna "Lado" também na tabela do jogador.
- Modo de times lembrado no navegador; padrão "Empilhados".
- Ordenação: 3º clique volta à ordem original.

## Decidido depois dos mockups

- **Tema só escuro** (Alex, 2026-11-08): site fixo no tema escuro; remover o seletor de tema do template (`theme-switcher.tsx`) e o modo claro.
