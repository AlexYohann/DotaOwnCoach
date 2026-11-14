-- v2.2: pedido de processamento do replay (linha do tempo do herói).
--
-- parse_requested_at: quando o site pediu à OpenDota; null = nunca pediu.
--   É a trava "um pedido por partida" (UPDATE ... WHERE parse_requested_at
--   IS NULL) e a base do teto diário de pedidos.
-- parse_job_id: o pedido na OpenDota ENQUANTO o resultado não é conhecido;
--   volta a null quando o site descobre o desfecho.
-- Não se guarda quem pediu: matches tem leitura pública e isso revelaria
-- quem abriu qual partida.
--
-- RLS: nada muda. matches continua com a política de leitura pública da
-- v1.3 e nenhuma política de escrita; só o servidor grava, com a secret key
-- (que ignora o RLS). As duas colunas não revelam nada sensível.
alter table public.matches
  add column parse_requested_at timestamptz,
  add column parse_job_id bigint;

-- O teto diário conta os pedidos das últimas 24 h.
create index matches_parse_requested_at_idx on public.matches (parse_requested_at)
  where parse_requested_at is not null;
