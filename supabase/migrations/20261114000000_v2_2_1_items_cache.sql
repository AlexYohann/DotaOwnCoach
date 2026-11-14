-- v2.2.1: lista de itens da OpenDota guardada no banco (como heroes).
--
-- Por quê: o cache de 1 dia ("use cache") em lib/opendota.ts não era
-- reaproveitado na Vercel — toda partida aberta baixava /constants/items de
-- novo (~0,2–0,3 s e 1 chamada do limite gratuito da OpenDota por visita).
--
-- Uma linha só (id = true) com o mapa inteiro item_id → Item já reduzido aos
-- campos que o site usa. O servidor renova quando passa de 1 dia.
create table public.items_cache (
  id          boolean primary key default true check (id),  -- sempre uma linha só
  items       jsonb       not null,
  updated_at  timestamptz not null default now()
);

alter table public.items_cache enable row level security;

-- Leitura pública: são dados públicos da OpenDota (nome, custo, descrição dos
-- itens), e a página lê com a chave pública.
create policy "items_cache: leitura pública"
  on public.items_cache for select to anon, authenticated using (true);

-- Escrita: NENHUMA política de INSERT/UPDATE/DELETE, de propósito. Com RLS
-- ligado, ausência de política = negado; só o servidor grava, com a secret
-- key (que ignora o RLS).
