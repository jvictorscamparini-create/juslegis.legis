-- Credenciais de integrações informadas pelo Administrador Geral no painel.
-- O valor é cifrado no servidor (AES-256-GCM) ANTES de chegar ao banco; aqui só fica o texto cifrado.
-- Nenhum papel de usuário (anon/authenticated) lê ou escreve: somente a service role, usada pelo backend.
create table public.integration_secrets (
  name text primary key check (name in ('OPENAI_API_KEY', 'MP_ACCESS_TOKEN_TEST', 'MP_ACCESS_TOKEN_PROD', 'MP_WEBHOOK_SECRET')),
  ciphertext text not null,
  last4 text not null check (char_length(last4) <= 4),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.integration_secrets enable row level security;
-- Sem políticas de propósito: com RLS ativo e nenhuma política, ninguém além da service role acessa.
revoke all on public.integration_secrets from anon, authenticated;
grant all on public.integration_secrets to service_role;
