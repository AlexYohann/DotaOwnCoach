-- v2.4 — teste obrigatório do diário: "com duas contas, nenhuma enxerga as
-- notas da outra". Roda no SQL Editor do Supabase (ou execute_sql do MCP).
--
-- Cria dois usuários de teste (A e B) e um visitante anônimo, troca de papel
-- como o PostgREST faz (role + request.jwt.claims) e confere cada regra.
-- Termina SEMPRE com um erro de propósito, o que desfaz tudo: nada fica no
-- banco. Resultado esperado: o erro "OK: todas as regras do RLS conferem".
-- Qualquer outra mensagem diz qual regra falhou.

do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  acc_a bigint := 990000001;
  acc_b bigint := 990000002;
  n integer;
  txt text;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'rls-a@steam.invalid', 'authenticated', 'authenticated'),
         (b, 'rls-b@steam.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (id, account_id, steam_id64)
  values (a, acc_a, 'rls-test-a'), (b, acc_b, 'rls-test-b');

  -- A, logado, grava a própria nota.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.match_notes (user_id, match_id, account_id, hero_id, won, played_at, bad_text)
  values (a, 1, acc_a, 7, true, now(), 'segredo de A');

  -- A não grava em nome de B, nem com a conta Steam de B.
  begin
    insert into public.match_notes (user_id, match_id, account_id, hero_id, played_at)
    values (b, 2, acc_b, 7, now());
    raise exception 'FALHOU: A gravou uma nota como B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.match_notes (user_id, match_id, account_id, hero_id, played_at)
    values (a, 3, acc_b, 7, now());
    raise exception 'FALHOU: A gravou uma nota com a conta Steam de B';
  exception when insufficient_privilege then null;
  end;

  -- B, logado: não vê, não edita, não apaga a nota de A.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.match_notes;
  if n <> 0 then raise exception 'FALHOU: B leu % nota(s) de A', n; end if;
  update public.match_notes set bad_text = 'alterado por B' where match_id = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: B editou a nota de A'; end if;
  delete from public.match_notes where match_id = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: B apagou a nota de A'; end if;

  -- B grava a própria nota, mas não consegue passá-la para A nem trocar a conta.
  insert into public.match_notes (user_id, match_id, account_id, hero_id, played_at)
  values (b, 1, acc_b, 9, now());
  begin
    update public.match_notes set user_id = a where match_id = 1;
    raise exception 'FALHOU: B passou a própria nota para A';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.match_notes set account_id = acc_a where match_id = 1;
    raise exception 'FALHOU: B trocou a conta da própria nota';
  exception when insufficient_privilege then null;
  end;

  -- Visitante deslogado (anon): não lê nada.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.match_notes;
  if n <> 0 then raise exception 'FALHOU: visitante anônimo leu % nota(s)', n; end if;

  -- A de novo: vê só a própria, intacta.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*), max(bad_text) into n, txt from public.match_notes;
  if n <> 1 or txt <> 'segredo de A' then
    raise exception 'FALHOU: A vê % nota(s), texto "%"', n, txt;
  end if;

  raise exception 'OK: todas as regras do RLS conferem';
end $$;
