-- v1.3.0 — dados da OpenDota guardados no Supabase (cache persistente).
--
-- Modelo de acesso, igual nas 4 tabelas:
--   * RLS ligado + UMA política de SELECT para anon e authenticated.
--   * NENHUMA política de INSERT/UPDATE/DELETE: com RLS ligado, ausência de
--     política = negado. Só o servidor grava, usando a secret key, que ignora RLS.
-- São dados que já são públicos na OpenDota (só existem para quem ativou
-- "Expor dados públicos de partidas" no Dota), por isso leitura pública.

-- ---------------------------------------------------------------------------
-- heroes: lista de heróis (nome + imagem), renovada pelo servidor a cada 1 dia.
create table public.heroes (
  id          integer primary key,                 -- hero_id da OpenDota
  name        text        not null,                -- nome localizado ("Anti-Mage")
  img         text        not null,                -- URL absoluta na CDN da Steam
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- players: perfil do jogador. fetched_at controla a regra dos 10 minutos
-- (perfil + lista de partidas recentes).
create table public.players (
  account_id   bigint primary key,                  -- Friend ID (32 bits)
  personaname  text,
  avatar       text,
  profile_url  text,
  fetched_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- matches: dados da partida. Partida terminada não muda.
-- detail = os 10 jogadores com itens (JSON compacto); null até alguém abrir
-- a tela da partida. Preenchido uma vez, nunca mais é buscado na API.
create table public.matches (
  match_id           bigint primary key,
  start_time         timestamptz not null,
  duration           integer     not null,           -- segundos
  radiant_win        boolean,                        -- null = indefinido
  radiant_score      integer,
  dire_score         integer,
  detail             jsonb,
  detail_fetched_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- player_matches: números de UM jogador em UMA partida (vem de recentMatches).
-- Tabela separada porque uma partida tem 10 jogadores: dois usuários do site
-- na mesma partida não podem sobrescrever um ao outro.
create table public.player_matches (
  account_id    bigint   not null references public.players (account_id) on delete cascade,
  match_id      bigint   not null references public.matches (match_id)   on delete cascade,
  start_time    timestamptz not null,  -- repetido de matches: ordenar sem join
  player_slot   smallint not null,
  hero_id       integer  not null,
  kills         integer  not null,
  deaths        integer  not null,
  assists       integer  not null,
  gold_per_min  integer  not null,
  xp_per_min    integer  not null,
  last_hits     integer  not null,
  primary key (account_id, match_id)
);

-- "últimas 20 partidas do jogador X" = filtro por account_id, ordem por data.
create index player_matches_recent_idx
  on public.player_matches (account_id, start_time desc);

-- ---------------------------------------------------------------------------
-- RLS + políticas
alter table public.heroes         enable row level security;
alter table public.players        enable row level security;
alter table public.matches        enable row level security;
alter table public.player_matches enable row level security;

-- Leitura pública: qualquer visitante (anon) ou usuário logado lê todas as linhas.
create policy "heroes: leitura pública"
  on public.heroes for select to anon, authenticated using (true);

create policy "players: leitura pública"
  on public.players for select to anon, authenticated using (true);

create policy "matches: leitura pública"
  on public.matches for select to anon, authenticated using (true);

create policy "player_matches: leitura pública"
  on public.player_matches for select to anon, authenticated using (true);

-- (sem políticas de escrita, de propósito — ver o topo do arquivo)
