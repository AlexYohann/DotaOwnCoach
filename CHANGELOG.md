# Changelog

Versões seguem [SemVer](https://semver.org/lang/pt-BR/): MAJOR.MINOR.PATCH.
Cada versão tem uma tag git `vX.Y.Z`.

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
