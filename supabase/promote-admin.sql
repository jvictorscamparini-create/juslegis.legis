-- Promove a conta do Administrador Geral. Execute no SQL Editor do Supabase
-- depois que essa conta tiver feito o primeiro login (o perfil é criado no cadastro).
-- E-mail configurado: jvictor.scamparini@gmail.com. Não existe outra forma de virar admin:
-- o papel não pode ser alterado pelo próprio usuário (ver revoke/grant em profiles).

update public.profiles
set role = 'admin'
where lower(email) = 'jvictor.scamparini@gmail.com';
