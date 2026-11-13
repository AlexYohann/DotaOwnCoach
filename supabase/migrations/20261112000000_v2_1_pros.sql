-- v2.1.0 — pro players e times da OpenDota guardados no Supabase.
--
-- A lista é renovada pelo servidor uma vez por dia (cron da Vercel em
-- /pros/refresh; a visita a /pros é só rede de segurança).
--
-- Modelo de acesso:
--   * pro_teams e pro_players: igual às tabelas da v1.3. RLS ligado + UMA
--     política de SELECT para anon e authenticated; NENHUMA política de
--     INSERT/UPDATE/DELETE (com RLS ligado, ausência de política = negado).
--     Só o servidor grava, com a secret key, que ignora o RLS. São dados que
--     já são públicos na OpenDota.
--   * pros_refresh: RLS ligado e NENHUMA política. Nem leitura pública: é
--     controle interno, só o servidor (secret key) lê e grava.

-- Busca tolerante a erro de digitação ("yatorro" acha "Yatoro").
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- pro_teams: os times de /teams (até 1.000). roster só nos times em destaque.
create table public.pro_teams (
  team_id          bigint primary key,
  name             text        not null,
  tag              text,
  logo_url         text,                          -- só https (o servidor filtra)
  rating           real        not null,          -- Elo da OpenDota, começa em 1000
  last_match_time  timestamptz,
  roster           jsonb,                         -- [{account_id, name}] ou null
  fetched_at       timestamptz not null default now()
);

-- Os times em destaque são os que têm elenco gravado.
create index pro_teams_featured on public.pro_teams (rating desc)
  where roster is not null;

-- ---------------------------------------------------------------------------
-- pro_players: os registros de /proPlayers (~5.700).
create table public.pro_players (
  account_id       bigint primary key,
  name             text        not null,          -- nick de pro
  name_norm        text        not null,          -- normalizeNick() de lib/pros.ts
  personaname      text,                          -- nome atual na Steam
  avatar           text,
  team_id          bigint,                        -- sem FK: muitos times ficam fora dos 1.000
  team_name        text,
  team_tag         text,
  verified         boolean     not null default false,  -- "is_locked" da OpenDota
  last_match_time  timestamptz,
  fetched_at       timestamptz not null default now()
);

create index pro_players_name_trgm on public.pro_players
  using gin (name_norm extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- pros_refresh: uma linha só. attempted_at é a "reserva" (no máximo uma
-- tentativa a cada 10 minutos); completed_at diz se a lista está em dia.
create table public.pros_refresh (
  id            boolean primary key default true check (id),
  attempted_at  timestamptz not null default 'epoch',
  completed_at  timestamptz
);
insert into public.pros_refresh default values;

-- ---------------------------------------------------------------------------
-- RLS
alter table public.pro_teams    enable row level security;
alter table public.pro_players  enable row level security;
alter table public.pros_refresh enable row level security;

-- Qualquer visitante lê times e pros (dados públicos da OpenDota).
create policy "leitura pública" on public.pro_teams
  for select to anon, authenticated using (true);
create policy "leitura pública" on public.pro_players
  for select to anon, authenticated using (true);
-- pros_refresh: sem política de propósito (ver cabeçalho).

-- ---------------------------------------------------------------------------
-- search_pros: até 5 verificados e 5 não verificados para o texto digitado.
-- q chega normalizado pelo servidor (cleanQuery: só letras e números, 2 a 32
-- caracteres), então não carrega % nem _.
-- Ordem em cada grupo: começa com q → contém q → parecido (trigram, só a
-- partir de 3 caracteres); empate: partida mais recente.
-- security invoker: roda com as permissões de quem chama, ou seja, passa pelo
-- RLS como qualquer leitura pública. search_path vazio: nomes sempre com schema.
create function public.search_pros(q text)
returns table (
  account_id       bigint,
  name             text,
  avatar           text,
  team_name        text,
  team_tag         text,
  logo_url         text,
  last_match_time  timestamptz,
  verified         boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (
    select p.account_id, p.name, p.avatar, p.team_id, p.team_name, p.team_tag,
           p.last_match_time, p.verified,
           case when p.name_norm like q || '%' then 0
                when p.name_norm like '%' || q || '%' then 1
                else 2 end as tier,
           extensions.similarity(p.name_norm, q) as sim
    from public.pro_players p
    where p.name_norm <> ''
      and (p.name_norm like '%' || q || '%'
           or (char_length(q) >= 3 and extensions.similarity(p.name_norm, q) > 0.3))
  ), r as (
    select m.*, row_number() over (
      partition by m.verified
      order by m.tier, m.sim desc, m.last_match_time desc nulls last, m.account_id
    ) as rn
    from m
  )
  select r.account_id, r.name, r.avatar, r.team_name, r.team_tag,
         t.logo_url, r.last_match_time, r.verified
  from r
  left join public.pro_teams t on t.team_id = r.team_id
  where r.rn <= 5
  order by r.verified desc, r.rn;
$$;

revoke all on function public.search_pros(text) from public;
grant execute on function public.search_pros(text) to anon, authenticated;
