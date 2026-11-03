-- Desempenho do RLS e índices de chaves estrangeiras (avisos do Supabase Advisor).
-- Não muda quem pode ver ou alterar o quê: apenas troca auth.uid() / is_admin() por
-- (select ...), que o Postgres avalia uma vez por consulta em vez de uma vez por linha,
-- e junta as duas políticas de UPDATE de profiles (permissivas = OR) em uma só.

begin;

-- admin_audit_log
drop policy if exists admin_audit_insert on public.admin_audit_log;
create policy admin_audit_insert on public.admin_audit_log for insert
  with check ((select public.is_admin()) and actor_id = (select auth.uid()));

-- cases
drop policy if exists cases_own on public.cases;
create policy cases_own on public.cases for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- conversations
drop policy if exists conversations_own on public.conversations;
create policy conversations_own on public.conversations for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (case_id is null or exists (
      select 1 from public.cases c where c.id = conversations.case_id and c.user_id = (select auth.uid())
    ))
  );

-- documents
drop policy if exists documents_own on public.documents;
create policy documents_own on public.documents for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and storage_path like ((select auth.uid())::text || '/%'));

-- messages
drop policy if exists messages_own on public.messages;
create policy messages_own on public.messages for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = (select auth.uid()))
  );

-- payments
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- petition_verified_sources
drop policy if exists petition_verified_sources_select_own on public.petition_verified_sources;
create policy petition_verified_sources_select_own on public.petition_verified_sources for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.petitions p where p.id = petition_verified_sources.petition_id and p.user_id = (select auth.uid()))
  );

-- petition_versions
drop policy if exists petition_versions_own on public.petition_versions;
create policy petition_versions_own on public.petition_versions for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.petitions p where p.id = petition_versions.petition_id and p.user_id = (select auth.uid()))
  );

-- petitions
drop policy if exists petitions_own on public.petitions;
create policy petitions_own on public.petitions for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- profiles: uma única política de UPDATE (dono ou administrador)
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = (select auth.uid()) or (select public.is_admin()));

-- subscriptions
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- usage_events
drop policy if exists usage_select on public.usage_events;
create policy usage_select on public.usage_events for select
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Índices para chaves estrangeiras sem cobertura
create index if not exists admin_audit_log_actor_id_idx on public.admin_audit_log (actor_id);
create index if not exists admin_settings_updated_by_idx on public.admin_settings (updated_by);
create index if not exists ai_prompts_created_by_idx on public.ai_prompts (created_by);
create index if not exists conversations_case_id_idx on public.conversations (case_id);
create index if not exists integration_checks_checked_by_idx on public.integration_checks (checked_by);
create index if not exists integration_secrets_updated_by_idx on public.integration_secrets (updated_by);
create index if not exists messages_user_id_idx on public.messages (user_id);
create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists petition_verified_sources_user_id_idx on public.petition_verified_sources (user_id);
create index if not exists petition_versions_user_id_idx on public.petition_versions (user_id);

commit;
