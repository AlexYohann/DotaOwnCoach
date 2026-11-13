-- v2.1: quando foi o último pedido de renovação do perfil (nome e avatar) à
-- OpenDota para a conta de cada usuário logado.
--
-- Por quê: a OpenDota guarda uma cópia do perfil da Steam e não a renova
-- sozinha com frequência; quem trocava de nome na Steam continuava com o nome
-- antigo no site. O servidor passa a pedir a renovação da PRÓPRIA conta de
-- quem está logado, no máximo uma vez por dia — esta coluna é a trava
-- (UPDATE condicional em lib/profile-refresh.ts).
--
-- RLS: nada muda. profiles continua com uma única política — o dono lê a
-- própria linha — e nenhuma política de escrita. Quem grava esta coluna é só
-- o servidor, com a secret key (que ignora o RLS). O dono passa a enxergar
-- também esta data na própria linha, o que não revela nada de ninguém.
alter table public.profiles
  add column profile_refreshed_at timestamptz;
