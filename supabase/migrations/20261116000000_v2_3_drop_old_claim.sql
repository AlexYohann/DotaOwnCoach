-- v2.3.0 — limpeza: apaga a versão de 4 parâmetros de claim_peers_refresh.
-- Ela foi neutralizada (select false) na migração 20261115010000 porque o DROP
-- pede confirmação manual e o Alex estava fora; confirmado por ele em 2026-11-16.
-- O servidor usa só a versão de 6 parâmetros (com o teto do site).
drop function if exists public.claim_peers_refresh(bigint, integer, integer, integer);
