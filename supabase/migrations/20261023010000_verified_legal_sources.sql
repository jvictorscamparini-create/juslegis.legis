create table public.petition_verified_sources (
  id uuid primary key default gen_random_uuid(),
  petition_id uuid not null unique references public.petitions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  categories text[] not null,
  request_hash text not null,
  consulted_at timestamptz not null default now(),
  sources jsonb not null check (jsonb_typeof(sources) = 'array')
);

alter table public.petition_verified_sources enable row level security;

create policy petition_verified_sources_select_own on public.petition_verified_sources
  for select to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.petitions p where p.id = petition_id and p.user_id = auth.uid())
  );

revoke all on public.petition_verified_sources from anon, authenticated;
grant select on public.petition_verified_sources to authenticated;
grant all on public.petition_verified_sources to service_role;
