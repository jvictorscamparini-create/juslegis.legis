-- Medição de custo real das chamadas à OpenAI.
-- Aditiva: só acrescenta colunas e uma tabela. Não altera nem apaga dados existentes.

-- ─────────────────────────────────────────────────────────────
-- Tabela de preços por modelo (versionada: uma linha por vigência)
-- ─────────────────────────────────────────────────────────────
create table public.ai_model_prices (
  id uuid primary key default gen_random_uuid(),
  -- Nome do modelo ou prefixo do snapshot (ex.: "gpt-5-mini" cobre "gpt-5-mini-2025-08-07").
  model text not null check (length(model) between 1 and 100),
  input_per_mtok_usd numeric(12, 6) not null check (input_per_mtok_usd >= 0),
  cached_input_per_mtok_usd numeric(12, 6) check (cached_input_per_mtok_usd >= 0),
  output_per_mtok_usd numeric(12, 6) not null check (output_per_mtok_usd >= 0),
  -- Preço por 1.000 chamadas de ferramenta, ex.: {"web_search_call": 10, "file_search_call": 2.5}.
  tool_prices_per_1k_usd jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (model, effective_from)
);
create index ai_model_prices_lookup_idx on public.ai_model_prices (model, effective_from desc);

alter table public.ai_model_prices enable row level security;
-- Somente o administrador lê; escrita apenas pelo servidor (service role) após checar is_admin().
create policy ai_model_prices_admin_select on public.ai_model_prices
  for select using ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────
-- usage_events: dados reais de uso retornados pela API e custo calculado
-- ─────────────────────────────────────────────────────────────
alter table public.usage_events
  add column request_id text,
  add column cached_input_tokens integer not null default 0,
  add column reasoning_tokens integer not null default 0,
  add column tool_calls jsonb not null default '{}'::jsonb,
  add column price_id uuid references public.ai_model_prices (id) on delete set null,
  add column cost_usd numeric(14, 8),
  add column usd_brl_rate numeric(10, 4),
  add column cost_brl numeric(14, 6),
  add column status text not null default 'ok' check (status in ('ok', 'error')),
  add column error_code text;

comment on column public.usage_events.cost_usd is
  'Custo estimado pela tabela ai_model_prices vigente. NULL = modelo sem preço cadastrado (não precificado).';
comment on column public.usage_events.request_id is
  'ID da resposta da OpenAI (resp_...), para conciliação com o faturamento.';

create index usage_events_created_idx on public.usage_events (created_at desc);
