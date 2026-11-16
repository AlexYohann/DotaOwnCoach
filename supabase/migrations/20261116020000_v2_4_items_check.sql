-- v2.4.0 — achado da revisão final: o limite de bytes de missing_items
-- (6 × 1.400) podia recusar um motivo válido de 300 caracteres, porque
-- aspas e caracteres especiais ocupam até 6 bytes cada no texto do JSON.
-- Nova folga: 6 itens × (300 caracteres × 6 bytes + 200 de estrutura).
-- O limite por motivo (300) e por quantidade (6) continua em lib/diary.ts.
alter table public.match_notes drop constraint match_notes_items_shape;
alter table public.match_notes add constraint match_notes_items_shape check (
  jsonb_typeof(missing_items) = 'array' and jsonb_array_length(missing_items) <= 6
  and octet_length(missing_items::text) <= 6 * 2000
);
