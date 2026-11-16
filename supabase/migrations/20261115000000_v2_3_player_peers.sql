-- v2.3.0 — "Quem joga comigo": parceiros de cada jogador (/players/{id}/peers
-- da OpenDota), guardados porque a chamada é lenta (~45 s) e instável.

-- ---------------------------------------------------------------------------
-- player_peers: uma linha por jogador.
--   * account_id referencia players: só se busca parceiros de uma conta que a
--     página do jogador já carregou (ID que existe na OpenDota).
--   * peers: lista já filtrada (3+ partidas juntos, no máximo 60); null até a
--     primeira busca dar certo.
--   * fetched_at: quando a lista foi buscada (vale 12 h).
--   * refresh_started_at: renovação em andamento (null = nenhuma).
--   * refresh_failed_at: última falha da OpenDota (espera 10 min para tentar de novo).
create table public.player_peers (
  account_id          bigint primary key references public.players (account_id) on delete cascade,
  peers               jsonb,
  fetched_at          timestamptz,
  refresh_started_at  timestamptz,
  refresh_failed_at   timestamptz
);

-- RLS: leitura pública, como players/matches. Os parceiros já são públicos na
-- OpenDota (só existem para quem ativou "Expor dados públicos de partidas").
-- NENHUMA política de INSERT/UPDATE/DELETE: com RLS ligado, ausência de
-- política = negado. Só o servidor grava, com a secret key (ignora RLS).
alter table public.player_peers enable row level security;

create policy "player_peers: leitura pública"
  on public.player_peers for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- claim_peers_refresh: reserva a renovação de uma conta, de forma atômica.
-- Devolve true só para UM chamador quando a lista pode ser renovada: vencida
-- (ou ausente), sem renovação em andamento e sem falha recente — a mesma regra
-- de peersState() em lib/peers.ts (os prazos vêm de lá como parâmetros).
-- Duas abas abrindo a mesma conta → uma chamada à OpenDota, não duas.
--
-- security definer + search_path vazio: roda como dono e só enxerga nomes
-- qualificados. Execução revogada de anon/authenticated: só o servidor
-- (service_role, secret key) chama; a chave pública não reserva nada.
create function public.claim_peers_refresh(
  p_account_id bigint,
  p_ttl_s      integer,
  p_running_s  integer,
  p_retry_s    integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  insert into public.player_peers (account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;

  update public.player_peers
     set refresh_started_at = now()
   where account_id = p_account_id
     and (fetched_at is null or fetched_at < now() - make_interval(secs => p_ttl_s))
     and (refresh_started_at is null or refresh_started_at < now() - make_interval(secs => p_running_s))
     and (refresh_failed_at is null or refresh_failed_at < now() - make_interval(secs => p_retry_s))
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke execute on function public.claim_peers_refresh(bigint, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_peers_refresh(bigint, integer, integer, integer)
  to service_role;
