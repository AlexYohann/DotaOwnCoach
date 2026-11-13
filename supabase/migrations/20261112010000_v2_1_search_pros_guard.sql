-- v2.1 (revisão final): search_pros passa a conferir o texto ela mesma.
--
-- Por quê: a função é chamável por `anon` direto em /rest/v1/rpc/search_pros
-- (a publishable key está no navegador), sem passar pelo cleanQuery do
-- servidor. Antes ela confiava nessa limpeza. Chamada direta com um texto de
-- centenas de KB fazia o banco calcular a semelhança contra ~5.700 nicks até
-- estourar o tempo limite — várias em paralelo derrubariam o banco de graça.
-- Curingas (% e _) também valiam no LIKE.
--
-- Agora: texto fora de 2 a 32 caracteres, ou com %, _ ou \, devolve vazio. A
-- condição não depende de nenhuma linha, então o Postgres a resolve antes de
-- ler a tabela (nenhuma semelhança é calculada).
--
-- Permissões e RLS não mudam: `create or replace` mantém os grants
-- (execute para anon e authenticated) e a função continua security invoker,
-- lendo pro_players e pro_teams pelas políticas de leitura pública.
create or replace function public.search_pros(q text)
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
    where char_length(q) between 2 and 32
      and q !~ '[%_\\]'
      and p.name_norm <> ''
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
