# Dota Own Coach

Coach pessoal de Dota 2: acompanhe as próprias partidas, anote o que deu certo e errado em cada uma e defina metas para evoluir.

> Projeto de fã, não afiliado à Valve. Dota 2 é marca registrada da Valve Corporation. Dados de partidas pela [OpenDota](https://www.opendota.com/).

**Versão atual: v1.4.0** · histórico detalhado no [CHANGELOG](CHANGELOG.md)

---

## Por que existe

Sites de estatísticas mostram números, mas não ajudam a responder "o que eu preciso melhorar?". A ideia é juntar quatro coisas num lugar só:

1. **Ver as partidas:** histórico com herói, resultado, K/D/A, farm e itens.
2. **Refletir sobre elas:** um diário com uma nota por partida (o que errou, o que fez bem, tags como "farm ruim" ou "morri cedo").
3. **Medir a evolução:** metas como "mortes ≤ 5" ou "last hits aos 10 min ≥ 50", acompanhadas ao longo das partidas.
4. **Pedir uma segunda opinião:** quem quiser deixa uma partida pública para outros jogadores comentarem minuto a minuto.

Também é um projeto de portfólio: web (Next.js + Supabase) e, mais adiante, app mobile usando o mesmo backend.

---

## Versões lançadas

Cada versão tem uma tag git (`vX.Y.Z`) e uma entrada no [CHANGELOG](CHANGELOG.md).

| Versão | O que entrou |
|---|---|
| **v1.0.0** | Busca por Steam ID (Friend ID ou SteamID64) e página do jogador com as últimas 20 partidas: resultado, K/D/A, duração, GPM/XPM e last hits. Mensagens claras para ID inválido, perfil privado, jogador inexistente, limite de requisições e OpenDota fora do ar. |
| **v1.1.0** | Nome e imagem do herói no histórico, coluna de data e hora, e atalho para a página da Steam onde aparece o Steam ID. |
| **v1.2.0** | Tela de detalhes da partida: os dois times com itens, painel com as estatísticas do herói selecionado e preview do que cada item faz ao passar o mouse. Título da aba "Dota Own Coach". |
| **v1.3.0** | Dados guardados no Supabase (heróis, jogador, partidas e detalhes): recarregar a página não chama a OpenDota de novo por 10 minutos, e partida já aberta nunca é buscada outra vez. Se a OpenDota cair, mostra o último dado salvo com aviso. |
| **v1.3.1** | Páginas mais rápidas (gravações no banco não seguram mais a resposta) e testes automatizados com Vitest. |
| **v1.4.0** | Visual novo, só escuro: heróis animados oficiais da Valve, home estilo capa com link para o código de amigo da Steam, página do jogador com a última partida em destaque e o herói mais jogado, tela da partida com o herói selecionado ao fundo, cosméticos, times em dois modos (completo / lado a lado) e ordenação por coluna. |

As versões 1.1 e 1.2 foram além do plano original da v1 (a tela da partida estava prevista só para depois). Por isso o roteiro abaixo foi **renumerado a partir da v1.3**.

---

## Roteiro

Cada etapa tem um critério de pronto, para dar para saber quando ela acabou de verdade.

### v1: busca de partidas (sem login)

- [x] **v1.0: busca básica.** Pronto quando: você digita seu ID e vê suas partidas corretas, com vitória e derrota certas.
- [x] **v1.1: heróis.** Pronto quando: todas as partidas mostram o herói certo. *(Feito com a lista de heróis da OpenDota em cache no servidor. A tabela no Supabase entra na v1.3.)*
- [x] **v1.2: detalhes da partida.** Adiantado do roteiro: times, itens, estatísticas por herói e preview dos itens.
- [x] **v1.3: dados no Supabase.**
  - Tabela `heroes` com leitura pública via RLS, preenchida a partir da OpenDota.
  - Tabelas `players` e `matches`, com leitura pública e escrita só pelo servidor (a secret key nunca vai em variável `NEXT_PUBLIC_`). *(Entrou também `player_matches`: uma partida tem 10 jogadores, e dois usuários do site na mesma partida não podem sobrescrever um ao outro.)*
  - Regra de cache: se os dados têm menos de 10 minutos, vêm do banco; se não, busca na API e atualiza.
  - Pronto quando: recarregar a página várias vezes não gera novas chamadas à OpenDota (dá para conferir pelo `fetched_at` no Table Editor).
  - Por que no banco, se já existe cache no servidor: o cache atual fica na memória, separado por instância e apagado a cada deploy. O banco persiste e guarda o histórico de que a v3 precisa.
- [x] **v1.4: visual.** Design aprovado em rodadas de mockup: `docs/superpowers/specs/2026-11-08-v1-4-visual-design.md`.
  - Mini design system (paleta, fontes, espaçamento), aprovado antes de aplicar, com prints de referência e rodadas de crítica. O shadcn/ui já está instalado.
  - Rodapé com "Projeto de fã, não afiliado à Valve".
  - Pronto quando: você mostraria a página para alguém sem vergonha.
- [ ] **v1.5: primeiro deploy.**
  - Vercel, com as variáveis de ambiente (inclusive a secret) e as funções na região de São Paulo (`gru1`). O repositório já está no GitHub.
  - No Supabase, colocar a URL da Vercel em Authentication → URL Configuration.
  - Pronto quando: o site funciona na URL `.vercel.app`.

### v2: login e diário

- Login (o template já tem) e tabela `profiles` ligando o usuário ao `account_id`.
- Tabela `match_notes`, com uma nota por partida: o que errou, o que fez bem e tags.
- RLS privado: cada usuário só lê e edita as próprias notas.
- Página "Minhas partidas", com as notas ao lado de cada partida.
- **Pronto quando:** com duas contas, nenhuma enxerga as notas da outra. Esse teste é obrigatório.

### v3: metas e evolução

- Tabela `goals` (métrica, valor-alvo, período). Por exemplo: "last hits aos 10 min ≥ 50" ou "mortes ≤ 5".
- Página de evolução com gráficos das métricas nas últimas N partidas e marcação de meta batida ou não.
- Métricas como last hits aos 10 min exigem o detalhe da partida (`/matches/{id}`), que custa mais requisições; o cache da v1.3 vira essencial.
- **A conferir antes de começar:** os dados minuto a minuto (`lh_t`) só existem em partidas que a OpenDota processou a partir do replay. Nas partidas testadas até agora, todas tinham, mas eram de um jogador profissional. É preciso conferir com partidas comuns.
- **Pronto quando:** você define uma meta e vê se está melhorando ao longo das partidas.

### v4: extras (opcionais, escolher 1 ou 2)

- **Resumo da semana:** texto gerado com IA a partir das notas e estatísticas (ex.: "você morreu mais nas partidas de suporte").
- **Comparação com a party:** as próprias métricas ao lado das de amigos.
- **App mobile com Expo:** mesmo Supabase, para consultar partidas e anotar no celular logo depois do jogo.

### v5: revisão pela comunidade

Quem quiser deixa uma partida pública para outros jogadores avaliarem o que errou, onde errou e o que poderia ser melhor. Depende da v2 (login e diário).

- **Linha do tempo de cada jogador** na tela da partida: quando fechou cada item, quando pegou cada kill e quando morreu, além das curvas de ouro, XP e last hits minuto a minuto. Os dados existem na OpenDota (`purchase_log`, `kills_log`, `deaths_log`, `gold_t`, `xp_t`, `lh_t`). Assistências não têm horário próprio.
- **Partida pública por escolha do dono, uma a uma.** O padrão continua privado.
- **Comentários presos a um minuto** (ex.: "21:43, comprou BKB tarde"). Nova tabela `match_reviews`: quem avaliou, partida, minuto, categoria (farm, posicionamento, itens, decisão) e texto.
- **RLS:**
  - outros só veem a partida e os comentários se ela for pública;
  - só usuário logado comenta, e ninguém comenta a própria partida;
  - o dono pode apagar comentários na partida dele.
- **Link compartilhável** `/review/[id]`.
- **Depois, se houver uso:** lista de partidas pedindo avaliação, categorias e reputação dos avaliadores.
- **Riscos:**
  - **Começar sem avaliadores:** começar pela party e pelos amigos; a IA da v4 pode ser a primeira avaliadora.
  - **Linha do tempo só em partida processada:** ela só existe em partidas que a OpenDota processou a partir do replay. Dá para pedir o processamento (`POST /request/{match_id}`; testado em 2026-11-08: uma partida comum foi processada em segundos e passou a ter `purchase_log`), mas só enquanto o replay existir, então o pedido precisa ser automático, logo após o jogo.
  - **Comentários abusivos:** a moderação básica (só logado comenta, o dono apaga) entra desde o início.
- **Pronto quando:** outra conta comenta um minuto específico da sua partida pública, e uma partida privada continua invisível para ela. Esse teste com duas contas é obrigatório.

### Ideias futuras (sem versão)

- **Herói animado com os cosméticos que o jogador usava na partida.** Pedido do Alex (2026-11-07). Hoje não existe: as animações oficiais da Valve (`.webm` no CDN da Steam) mostram só o visual padrão do herói. A lista de cosméticos existia na OpenDota (`players[].cosmetics`), mas **no patch 60 ela vem vazia até em partidas processadas e profissionais** (conferido em 2026-11-08; no patch 56, jan/2025, vinha). Sem fonte de dados atual, esta ideia depende de achar outra (STRATZ? replay próprio?).
  - **O que exigiria:** os modelos 3D do herói e dos itens (arquivos do jogo, formato do Source 2), convertidos para um formato web (glTF), um renderizador 3D no navegador (ex.: three.js) e as animações do herói. Antes de começar, conferir se a Valve permite exibir esses arquivos num projeto de fã: redistribuir arquivos do jogo é diferente de linkar imagens do CDN.
  - **Passo intermediário (entra na v1.4):** mostrar os ícones e nomes dos cosméticos no painel do herói.

---

## Stack

- [Next.js 16](https://nextjs.org) (App Router, `cacheComponents`), React 19 e TypeScript
- [Supabase](https://supabase.com) (auth via cookies com `@supabase/ssr`; tabelas de cache com RLS desde a v1.3)
- Tailwind CSS v3 + [shadcn/ui](https://ui.shadcn.com)
- [OpenDota API](https://docs.opendota.com/) (plano gratuito; chamadas só no servidor)

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY
npm run dev                  # http://localhost:3000
```

Banco: aplique as migrações de `supabase/migrations/` no seu projeto Supabase (SQL Editor ou `supabase db push`). Sem a `SUPABASE_SECRET_KEY` o site funciona, mas não grava nada no banco.

Outros comandos: `npm test` (testes com Vitest), `npm run lint`, `npm run build` (build de produção, também checa os tipos) e `npx tsc --noEmit` (só os tipos).

Para ver as próprias partidas, no Dota 2 ative **Configurações → Opções → Social → "Expor dados públicos de partidas"**.
