-- v2.3.0 — teto do site inteiro para a busca de parceiros (achado da revisão final).
--
-- Por quê: a reserva por conta (claim_peers_refresh) impedia buscar a MESMA
-- conta duas vezes, mas não limitava contas diferentes. Um script — ou o
-- Googlebot, que executa JavaScript — abrindo cem páginas de jogador dispararia
-- cem chamadas de ~45 s à OpenDota em um minuto. O limite gratuito dela é
-- ~60/min e ~3.000/dia, dividido com o site todo (a análise de replay já usa
-- até 30/min e 500/dia). Teto dos parceiros: 5 por minuto e 300 por dia
-- (valores em lib/peers.ts, passados como parâmetros).

-- peers_refresh_log: uma linha por reserva (por chamada à OpenDota). É o que
-- se conta para o teto. Uma conta cuja busca falha é reservada de novo a cada
-- 10 min: cada vez conta. Linhas com mais de 1 dia são apagadas pela própria
-- função. RLS ligado e NENHUMA política, de propósito: nem anon nem
-- authenticated leem ou escrevem; só a função (security definer) mexe nela.
-- (O advisor vai mostrar o INFO "RLS enabled no policy", esperado, como em pros_refresh.)
create table public.peers_refresh_log (
  claimed_at  timestamptz not null default now(),
  account_id  bigint      not null
);
create index peers_refresh_log_claimed_idx on public.peers_refresh_log (claimed_at);
alter table public.peers_refresh_log enable row level security;

-- A versão de 4 parâmetros (migração anterior) fica neutralizada: nunca
-- reserva. Não é apagada aqui porque DROP pede confirmação manual no painel e
-- esta migração foi aplicada com o Alex fora; apagar fica para uma limpeza.
-- Ninguém além do servidor podia chamá-la, e o servidor passa a usar a nova.
create or replace function public.claim_peers_refresh(
  p_account_id bigint,
  p_ttl_s      integer,
  p_running_s  integer,
  p_retry_s    integer
) returns boolean
language sql
security definer
set search_path = ''
as $$ select false $$;

-- Mesma regra por conta de antes + o teto. O advisory lock serializa as
-- reservas: sem ele, duas reservas simultâneas poderiam contar o mesmo total
-- e passar as duas do teto. (Lock de transação: some sozinho no fim.)
-- security definer + search_path vazio; execução só para service_role.
create function public.claim_peers_refresh(
  p_account_id  bigint,
  p_ttl_s       integer,
  p_running_s   integer,
  p_retry_s     integer,
  p_per_minute  integer,
  p_per_day     integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_minute integer;
  last_day    integer;
  claimed     boolean;
begin
  insert into public.player_peers (account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;

  perform pg_advisory_xact_lock(hashtext('claim_peers_refresh'));

  delete from public.peers_refresh_log where claimed_at < now() - interval '1 day';

  select count(*) filter (where claimed_at > now() - interval '1 minute'),
         count(*)
    into last_minute, last_day
    from public.peers_refresh_log;

  if last_minute >= p_per_minute or last_day >= p_per_day then
    return false;
  end if;

  update public.player_peers
     set refresh_started_at = now()
   where account_id = p_account_id
     and (fetched_at is null or fetched_at < now() - make_interval(secs => p_ttl_s))
     and (refresh_started_at is null or refresh_started_at < now() - make_interval(secs => p_running_s))
     and (refresh_failed_at is null or refresh_failed_at < now() - make_interval(secs => p_retry_s))
  returning true into claimed;

  if claimed then
    insert into public.peers_refresh_log (account_id) values (p_account_id);
  end if;
  return coalesce(claimed, false);
end;
$$;

revoke execute on function public.claim_peers_refresh(bigint, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_peers_refresh(bigint, integer, integer, integer, integer, integer)
  to service_role;
