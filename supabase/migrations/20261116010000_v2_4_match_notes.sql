-- v2.4.0 — Diário: uma nota privada por usuário por partida.
--
-- É a primeira tabela com conteúdo escrito pelo usuário e que só existe aqui
-- (o backup diário do banco, .github/workflows/backup-db.yml, cobre isto).
-- O servidor grava COM A SESSÃO do usuário (não com a secret key), então o
-- RLS abaixo é quem garante, no banco, que ninguém lê nem mexe na nota de
-- outra pessoa — mesmo que o código do servidor tenha um erro.

create table public.match_notes (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  match_id       bigint      not null,
  -- Copiados da partida ao salvar (o resumo não depende do cache de partidas):
  account_id     bigint      not null,          -- conta Steam do autor
  hero_id        integer     not null,
  won            boolean,                       -- null = resultado indefinido
  played_at      timestamptz not null,
  -- Conteúdo:
  good_tags      text[]      not null default '{}',
  bad_tags       text[]      not null default '{}',
  good_text      text        not null default '',
  bad_text       text        not null default '',
  missing_items  jsonb       not null default '[]',  -- [{ "item_id": 116, "reason": "…" }]
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, match_id),

  -- Limites (os mesmos de NOTE_LIMITS em lib/diary.ts). Protegem o banco de
  -- quem chamar a API REST direto com a própria sessão.
  constraint match_notes_good_text_len check (char_length(good_text) <= 2000),
  constraint match_notes_bad_text_len  check (char_length(bad_text)  <= 2000),
  constraint match_notes_good_tags_n   check (cardinality(good_tags) <= 12),
  constraint match_notes_bad_tags_n    check (cardinality(bad_tags)  <= 12),
  constraint match_notes_tags_len      check (
    char_length(array_to_string(good_tags, '')) <= 12 * 30
    and char_length(array_to_string(bad_tags, '')) <= 12 * 30
  ),
  constraint match_notes_items_shape   check (
    jsonb_typeof(missing_items) = 'array' and jsonb_array_length(missing_items) <= 6
    and octet_length(missing_items::text) <= 6 * 1400
  )
);

-- "Todas as minhas notas, mais recentes primeiro" (aba Diário).
create index match_notes_user_played_idx on public.match_notes (user_id, played_at desc);

alter table public.match_notes enable row level security;

-- SELECT: cada usuário logado lê só as próprias notas. Nada para anon.
create policy "match_notes: dono lê as próprias"
  on public.match_notes for select to authenticated
  using ((select auth.uid()) = user_id);

-- INSERT: só em nome de si mesmo, e com a própria conta Steam (a de profiles).
-- Impede gravar uma nota "como" outra pessoa ou com a conta de outra pessoa.
create policy "match_notes: dono cria as próprias"
  on public.match_notes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and account_id = (select p.account_id from public.profiles p where p.id = (select auth.uid()))
  );

-- UPDATE: só as próprias (using) e sem trocar o dono nem a conta (with check).
create policy "match_notes: dono edita as próprias"
  on public.match_notes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and account_id = (select p.account_id from public.profiles p where p.id = (select auth.uid()))
  );

-- DELETE: só as próprias.
create policy "match_notes: dono apaga as próprias"
  on public.match_notes for delete to authenticated
  using ((select auth.uid()) = user_id);
