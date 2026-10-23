-- JusLegis — schema inicial
-- Isolamento por usuário via RLS em todas as tabelas. Escritas sensíveis (consumo,
-- assinaturas, pagamentos, webhooks) só ocorrem pelo servidor com a service role.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Perfis e papéis
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'blocked')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- O próprio usuário só pode alterar o nome; papel e situação ficam fora do alcance dele.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Workspace do advogado
-- ─────────────────────────────────────────────────────────────
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);
create index cases_user_idx on public.cases (user_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  case_id uuid references public.cases (id) on delete set null,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_user_idx on public.conversations (user_id, updated_at desc);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null unique,
  name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  context text not null default 'assistant' check (context in ('assistant', 'petition', 'files')),
  created_at timestamptz not null default now()
);
create index documents_user_idx on public.documents (user_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  status text not null default 'ok' check (status in ('ok', 'error')),
  error_code text,
  document_ids uuid[] not null default '{}',
  model text,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.petitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Nova petição',
  step smallint not null default 1 check (step between 1 and 9),
  form jsonb not null default '{}'::jsonb,
  foundations jsonb not null default '[]'::jsonb,
  document_ids uuid[] not null default '{}',
  content_html text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index petitions_user_idx on public.petitions (user_id, updated_at desc);

create table public.petition_versions (
  id uuid primary key default gen_random_uuid(),
  petition_id uuid not null references public.petitions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  content_html text not null,
  created_at timestamptz not null default now()
);
create index petition_versions_idx on public.petition_versions (petition_id, created_at desc);

alter table public.cases enable row level security;
alter table public.conversations enable row level security;
alter table public.documents enable row level security;
alter table public.messages enable row level security;
alter table public.petitions enable row level security;
alter table public.petition_versions enable row level security;

create policy cases_own on public.cases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy conversations_own on public.conversations
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()))
  );

create policy documents_own on public.documents
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and storage_path like auth.uid()::text || '/%');

create policy messages_own on public.messages
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

create policy petitions_own on public.petitions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy petition_versions_own on public.petition_versions
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.petitions p where p.id = petition_id and p.user_id = auth.uid())
  );

-- Arquivos privados: cada usuário só acessa a própria pasta <user_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-files', 'user-files', false, 20971520,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
)
on conflict (id) do nothing;

create policy user_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─────────────────────────────────────────────────────────────
-- Consumo, assinaturas e pagamentos (escrita somente pelo servidor)
-- ─────────────────────────────────────────────────────────────
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index usage_events_user_idx on public.usage_events (user_id, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mp_preapproval_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  environment text not null check (environment in ('test', 'prod')),
  next_payment_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  mp_payment_id text not null unique,
  amount numeric(12, 2),
  status text not null,
  environment text not null check (environment in ('test', 'prod')),
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  type text,
  signature_valid boolean not null,
  result text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (provider, event_key)
);

alter table public.usage_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;

create policy usage_select on public.usage_events
  for select using (user_id = auth.uid() or public.is_admin());
create policy subscriptions_select on public.subscriptions
  for select using (user_id = auth.uid() or public.is_admin());
create policy payments_select on public.payments
  for select using (user_id = auth.uid() or public.is_admin());
create policy webhook_events_admin on public.webhook_events
  for select using (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- Administração
-- ─────────────────────────────────────────────────────────────
create table public.admin_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_idx on public.admin_audit_log (created_at desc);

create table public.ai_prompts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null default 1,
  content text not null,
  active boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (name, version)
);

create table public.integration_checks (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  ok boolean not null,
  detail text not null,
  checked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index integration_checks_idx on public.integration_checks (service, created_at desc);

alter table public.admin_settings enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.ai_prompts enable row level security;
alter table public.integration_checks enable row level security;

create policy admin_settings_admin on public.admin_settings
  for all using (public.is_admin()) with check (public.is_admin());
create policy admin_audit_select on public.admin_audit_log
  for select using (public.is_admin());
create policy admin_audit_insert on public.admin_audit_log
  for insert with check (public.is_admin() and actor_id = auth.uid());
create policy ai_prompts_admin on public.ai_prompts
  for all using (public.is_admin()) with check (public.is_admin());
create policy integration_checks_admin on public.integration_checks
  for all using (public.is_admin()) with check (public.is_admin());

-- Configurações que o workspace pode ler (preço, teste gratuito e módulos), sem expor o resto.
create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'features', (select value from public.admin_settings where key = 'features'),
    'plan', (select jsonb_build_object(
               'price_brl', value -> 'price_brl',
               'available', value -> 'available',
               'renewal', value -> 'renewal')
             from public.admin_settings where key = 'plan'),
    'trial', (select value from public.admin_settings where key = 'trial')
  )
  where auth.uid() is not null;
$$;

revoke execute on function public.get_public_settings() from anon;

insert into public.admin_settings (key, value) values
  ('ai_model', '{"provider":"openai","model":"","temperature":0.2,"max_output_tokens":null}'),
  ('ai_limits', '{"tokens_user_day":null,"tokens_user_month":null,"cost_month_brl":null,"alert_pct":80}'),
  ('features', '{"assistant":true,"petitions":true,"documents":true,"process_lookup":false,"legislation":false,"case_law":false,"agenda_files":false}'),
  ('plan', '{"price_brl":null,"tokens_month":null,"renewal":"auto","available":false,"mp_plan_id":null,"features":{"assistant":true,"petitions":true,"documents":true,"process_lookup":false,"legislation":false,"case_law":false,"agenda_files":false}}'),
  ('trial', '{"days":7,"ai_requests":null,"documents":null,"petitions":null,"max_tokens":null,"on_expire":"block"}'),
  ('legal', '{"provider":"","contract":"nc","sources":{"legislation":false,"summaries":false,"case_law":false,"doctrine":false,"process_lookup":false}}')
on conflict (key) do nothing;
