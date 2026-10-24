alter table public.profiles
  add column trial_started_at timestamptz,
  add column trial_duration_hours integer
    check (trial_duration_hours between 0 and 2160);

-- Preserve the effective duration for existing accounts; new accounts start only on first workspace activation.
update public.profiles
set trial_started_at = created_at,
    trial_duration_hours = coalesce(
      (select (value ->> 'days')::integer * 24 from public.admin_settings where key = 'trial'),
      168
    )
where trial_started_at is null;

create or replace function public.activate_trial()
returns table (
  trial_started_at timestamptz,
  trial_duration_hours integer,
  trial_ends_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_started_at timestamptz;
  v_duration_hours integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles p
  set trial_started_at = coalesce(p.trial_started_at, statement_timestamp()),
      trial_duration_hours = coalesce(
        p.trial_duration_hours,
        coalesce(
          (select (s.value ->> 'days')::integer * 24 from public.admin_settings s where s.key = 'trial'),
          72
        )
      )
  where p.id = v_user_id
  returning p.trial_started_at, p.trial_duration_hours
  into v_started_at, v_duration_hours;

  if not found then
    raise exception 'Profile not found';
  end if;

  return query
    select v_started_at, v_duration_hours, v_started_at + make_interval(hours => v_duration_hours);
end;
$$;

revoke all on function public.activate_trial() from public, anon;
grant execute on function public.activate_trial() to authenticated;
