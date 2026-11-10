-- v2.0.0 — login com a Steam: liga o usuário do site (auth.users) à conta Steam.
--
-- Quem grava: só o servidor, no callback do login (/auth/steam/callback),
-- usando a secret key (que ignora o RLS). Nome, avatar e partidas continuam
-- em players/player_matches (públicos); aqui fica só a ligação.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  account_id  bigint not null unique,   -- Friend ID (32 bits), = players.account_id
  steam_id64  text   not null unique,
  created_at  timestamptz not null default now(),
  last_login  timestamptz not null default now()
);
-- Sem FK para players: a pessoa pode logar antes de a OpenDota conhecer o
-- perfil dela (perfil privado ou conta nova).

alter table public.profiles enable row level security;

-- Leitura: cada usuário logado enxerga só a PRÓPRIA linha
-- (auth.uid() = id). Visitante sem login (anon) não tem política → não lê nada.
-- "(select auth.uid())" em vez de "auth.uid()": o Postgres calcula uma vez
-- por consulta, não uma vez por linha (recomendação do próprio Supabase).
create policy "profiles: dono lê a própria linha"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- Escrita: NENHUMA política de INSERT/UPDATE/DELETE, de propósito. Com RLS
-- ligado, ausência de política = negado; ninguém altera a própria ligação
-- com a Steam (isso deixaria qualquer um dizer que é dono de outra conta).
