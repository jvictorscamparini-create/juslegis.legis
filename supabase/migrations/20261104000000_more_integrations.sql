-- Novas integrações do painel do Administrador Geral. Somente acréscimos: nenhum dado existente muda.

-- 1. Aceita as chaves dos novos fornecedores no mesmo cofre cifrado.
alter table public.integration_secrets drop constraint integration_secrets_name_check;
alter table public.integration_secrets add constraint integration_secrets_name_check check (name in (
  'OPENAI_API_KEY',
  'MP_ACCESS_TOKEN_TEST',
  'MP_ACCESS_TOKEN_PROD',
  'MP_WEBHOOK_SECRET',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'ESCAVADOR_API_TOKEN',
  'JUDIT_API_KEY'
));

-- 2. Cadastro livre de outras APIs. Apenas guarda os dados: o sistema não chama estes endereços.
-- A chave é cifrada no servidor (AES-256-GCM) antes de chegar ao banco.
create table public.custom_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  base_url text not null check (base_url like 'https://%' and char_length(base_url) <= 300),
  notes text not null default '' check (char_length(notes) <= 300),
  ciphertext text,
  last4 text check (char_length(last4) <= 4),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.custom_integrations enable row level security;
-- Sem políticas de propósito: com RLS ativo e nenhuma política, ninguém além da service role acessa.
revoke all on public.custom_integrations from anon, authenticated;
grant all on public.custom_integrations to service_role;
