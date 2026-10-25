-- Teste de isolamento entre dois advogados (RLS). NÃO deixa dados: tudo termina em ROLLBACK.
-- Como rodar: SQL Editor do projeto hbqlwwnnbvritknwwzos (NUNCA no projeto odoavqqihukvpsmvopvf).
-- Resultado esperado: todas as linhas "ok" e nenhuma exceção.
begin;

-- Dois usuários descartáveis (o gatilho on_auth_user_created cria os perfis).
insert into auth.users (id, instance_id, aud, role, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'teste-a@juslegis.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'teste-b@juslegis.invalid');

-- Dados do usuário B, inseridos como B.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
insert into public.cases (name) values ('Caso do B');
insert into public.petitions (title, content_html) values ('Petição do B', '<p>sigilo do B</p>');

-- Agora como A: não pode ver, alterar nem apagar nada do B.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.cases;
  if n <> 0 then raise exception 'FALHA: A enxerga % caso(s) do B', n; end if;
  select count(*) into n from public.petitions;
  if n <> 0 then raise exception 'FALHA: A enxerga % petição(ões) do B', n; end if;

  update public.petitions set title = 'invadido';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA: A alterou % petição(ões) do B', n; end if;

  delete from public.cases;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA: A apagou % caso(s) do B', n; end if;

  begin
    insert into public.cases (user_id, name) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'forjado');
    raise exception 'FALHA: A conseguiu criar caso em nome do B';
  exception when insufficient_privilege or check_violation then
    null; -- esperado: bloqueado pela política (with check)
  end;
end $$;

select 'ok: A não lê, altera, apaga nem cria dados do B' as resultado;

-- B continua enxergando os próprios dados.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.cases where name = 'Caso do B';
  if n <> 1 then raise exception 'FALHA: B não vê o próprio caso'; end if;
end $$;
select 'ok: B enxerga os próprios dados' as resultado;

rollback;
