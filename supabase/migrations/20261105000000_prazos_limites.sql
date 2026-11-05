-- Agenda de prazos do advogado e limites de uso de IA por usuário.
-- Aditiva: só cria tabelas, políticas e uma função. Não altera nem apaga dados existentes.
-- Depende de 20261103010000_ai_cost_tracking.sql (coluna usage_events.cost_brl).

-- ─────────────────────────────────────────────────────────────
-- Prazos processuais salvos pelo advogado
-- ─────────────────────────────────────────────────────────────
create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  case_id uuid references public.cases (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  start_date date not null,
  days integer not null check (days between 1 and 3650),
  counting text not null check (counting in ('business', 'calendar')),
  doubled boolean not null default false,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index deadlines_user_due_idx on public.deadlines (user_id, status, due_date);
create index deadlines_case_idx on public.deadlines (case_id);

alter table public.deadlines enable row level security;
-- Cada advogado vê e altera somente os próprios prazos.
create policy deadlines_own on public.deadlines for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- Limite mensal de IA por usuário (sobrepõe o limite geral)
-- ─────────────────────────────────────────────────────────────
create table public.user_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tokens_month integer check (tokens_month is null or tokens_month > 0),
  cost_month_brl numeric(12, 2) check (cost_month_brl is null or cost_month_brl >= 0),
  note text check (note is null or char_length(note) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.user_limits enable row level security;
-- O próprio usuário pode ver o limite dele; só o administrador vê todos.
-- Não há política de escrita: alterações passam pelo servidor (service role) após checar is_admin().
create policy user_limits_select on public.user_limits for select
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ─────────────────────────────────────────────────────────────
-- Gasto total de IA no mês corrente (para o teto global)
-- ─────────────────────────────────────────────────────────────
create or replace function public.ai_cost_month_brl()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(cost_brl), 0)
  from public.usage_events
  where status = 'ok'
    and created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
$$;

-- Só o servidor consulta o total (evita expor o gasto da plataforma a qualquer usuário logado).
revoke execute on function public.ai_cost_month_brl() from public, anon, authenticated;
grant execute on function public.ai_cost_month_brl() to service_role;
