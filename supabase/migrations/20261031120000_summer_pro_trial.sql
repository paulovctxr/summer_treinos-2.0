-- Summer Treinos: teste gratuito único de sete dias do Summer PRO.
-- O teste não cria nem altera assinaturas pagas. Todos os prazos e permissões
-- são calculados no servidor e os dados PRO continuam preservados após o fim.
begin;

create table if not exists summer_private.pro_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint summer_pro_trials_period_check check (
    expires_at = started_at + interval '7 days'
  )
);
create index if not exists summer_pro_trials_expires_at
  on summer_private.pro_trials(expires_at);
alter table summer_private.pro_trials enable row level security;
revoke all on summer_private.pro_trials from public, anon, authenticated;

create or replace function summer_private.pro_trial_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  trial_row summer_private.pro_trials;
begin
  if account_id is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;

  select * into trial_row
  from summer_private.pro_trials t
  where t.user_id = account_id;

  return jsonb_build_object(
    'trial_used', trial_row.user_id is not null,
    'trial_active', trial_row.user_id is not null and trial_row.expires_at > now(),
    'trial_started_at', trial_row.started_at,
    'trial_expires_at', trial_row.expires_at
  );
end;
$$;
revoke all on function summer_private.pro_trial_state()
  from public, anon, authenticated;
grant execute on function summer_private.pro_trial_state() to authenticated;

create or replace function summer_private.has_trial_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from summer_private.pro_trials t
    where t.user_id = (select auth.uid())
      and t.expires_at > now()
  );
$$;
revoke all on function summer_private.has_trial_access()
  from public, anon, authenticated;
grant execute on function summer_private.has_trial_access() to authenticated;

-- One access predicate protects all existing PRO RLS policies. Academy
-- suspension blocks paid access and trials without deleting either record.
create or replace function public.summer_has_pro_access()
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select summer_private.is_active_member()) and (
    (select summer_private.is_admin())
    or exists (
      select 1 from public.summer_subscriptions s
      where s.user_id = (select auth.uid())
        and s.subscription_status = 'pro'
        and s.subscription_expires_at > now()
    )
    or (select summer_private.has_trial_access())
  );
$$;

create or replace function public.summer_has_paid_access()
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select summer_private.is_active_member()) and (
    (select summer_private.is_admin())
    or exists (
      select 1 from public.summer_subscriptions s
      where s.user_id = (select auth.uid())
        and s.subscription_status = 'pro'
        and s.subscription_expires_at > now()
    )
  );
$$;

-- The first PRO feature used the older paid-only predicate directly in its
-- policies. Keep `summer_has_paid_access` strict (it is also used to
-- distinguish paid accounts from trials), and move those policies to the
-- unified PRO predicate so a trial receives the same data access as PRO.
drop policy if exists summer_calories_read on public.summer_calorie_entries;
drop policy if exists summer_calories_insert on public.summer_calorie_entries;
drop policy if exists summer_calories_delete on public.summer_calorie_entries;
create policy summer_calories_read on public.summer_calorie_entries
  for select to authenticated using (
    user_id = (select auth.uid())
    and (select public.summer_has_pro_access())
  );
create policy summer_calories_insert on public.summer_calorie_entries
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (select public.summer_has_pro_access())
  );
create policy summer_calories_delete on public.summer_calorie_entries
  for delete to authenticated using (
    user_id = (select auth.uid())
    and (select public.summer_has_pro_access())
  );

create or replace function public.summer_get_access()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  subscription_row public.summer_subscriptions;
  trial_state jsonb;
  admin_active boolean := public.summer_is_admin();
  paid_active boolean;
  trial_active boolean;
  member_active boolean := summer_private.is_active_member();
begin
  if auth.uid() is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;

  select * into subscription_row
  from public.summer_subscriptions s
  where s.user_id = auth.uid();
  trial_state := summer_private.pro_trial_state();
  paid_active := member_active and subscription_row.user_id is not null
    and subscription_row.subscription_status = 'pro'
    and subscription_row.subscription_expires_at > now();
  trial_active := member_active
    and coalesce((trial_state ->> 'trial_active')::boolean, false)
    and not admin_active and not paid_active;

  return jsonb_build_object(
    'is_admin', admin_active,
    'access_kind', case
      when admin_active then 'admin'
      when paid_active then 'paid'
      when trial_active then 'trial'
      else 'free'
    end,
    'subscription_status', case
      when paid_active then 'pro'
      when subscription_row.subscription_status = 'cancelled' then 'cancelled'
      when subscription_row.subscription_status in ('pro', 'expired') then 'expired'
      else 'free'
    end,
    'subscription_plan', subscription_row.subscription_plan,
    'subscription_started_at', subscription_row.subscription_started_at,
    'subscription_expires_at', subscription_row.subscription_expires_at,
    'subscription_updated_at', subscription_row.subscription_updated_at,
    'trial_available', member_active and not admin_active and not paid_active
      and not coalesce((trial_state ->> 'trial_used')::boolean, false),
    'trial_used', coalesce((trial_state ->> 'trial_used')::boolean, false),
    'trial_active', trial_active,
    'trial_started_at', trial_state ->> 'trial_started_at',
    'trial_expires_at', trial_state ->> 'trial_expires_at',
    -- Compatibility with clients published before the trial was introduced.
    'plan', case when admin_active or paid_active or trial_active then 'plus' else 'basic' end,
    'expires_at', case
      when paid_active then subscription_row.subscription_expires_at
      when trial_active then (trial_state ->> 'trial_expires_at')::timestamptz
      else subscription_row.subscription_expires_at
    end,
    'server_time', now()
  );
end;
$$;

create or replace function summer_private.start_pro_trial()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  existing summer_private.pro_trials;
  started timestamptz;
  expiration timestamptz;
begin
  if account_id is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  perform summer_private.require_active_member();

  perform 1 from auth.users
  where id = account_id and deleted_at is null and email_confirmed_at is not null
  for update;
  if not found then
    raise exception 'Conta nao encontrada ou e-mail ainda nao confirmado';
  end if;

  if summer_private.is_admin() or exists (
    select 1 from public.summer_subscriptions s
    where s.user_id = account_id
      and s.subscription_status = 'pro'
      and s.subscription_expires_at > now()
  ) then
    return jsonb_build_object(
      'started', false, 'already_used', false, 'reason', 'already_pro',
      'trial_active', false, 'trial_started_at', null,
      'trial_expires_at', null, 'server_time', now()
    );
  end if;

  select * into existing from summer_private.pro_trials
  where user_id = account_id;
  if existing.user_id is not null then
    return jsonb_build_object(
      'started', false, 'already_used', true, 'reason', 'already_used',
      'trial_active', existing.expires_at > now(),
      'trial_started_at', existing.started_at,
      'trial_expires_at', existing.expires_at,
      'server_time', now()
    );
  end if;

  started := now();
  expiration := started + interval '7 days';
  insert into summer_private.pro_trials(user_id, started_at, expires_at)
  values (account_id, started, expiration);

  -- A trial changes effective access, not the paid subscription lifecycle, so
  -- the subscription-specific audit fields intentionally remain null.
  insert into summer_private.plan_audit(
    admin_id, student_id, action, old_plan, new_plan,
    old_expires_at, new_expires_at
  ) values (
    null, account_id, 'trial_start', 'basic', 'plus',
    null, expiration
  );

  return jsonb_build_object(
    'started', true, 'already_used', false, 'reason', 'started',
    'trial_active', true, 'trial_started_at', started,
    'trial_expires_at', expiration, 'server_time', now()
  );
end;
$$;
revoke all on function summer_private.start_pro_trial()
  from public, anon, authenticated;
grant execute on function summer_private.start_pro_trial() to authenticated;

create or replace function public.summer_start_pro_trial()
returns jsonb language sql security invoker set search_path = '' as $$
  select summer_private.start_pro_trial();
$$;
revoke all on function public.summer_start_pro_trial() from public, anon;
grant execute on function public.summer_start_pro_trial() to authenticated;

-- Trial members may generate one complete seven-day plan. Paid PRO and admins
-- retain the configured monthly allowance.
create or replace function summer_private.nutrition_access()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  pro_active boolean;
  paid_active boolean;
  limit_value integer;
  used_value integer;
  period_starts_at timestamptz;
  period_ends_at timestamptz;
begin
  if account_id is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;

  pro_active := public.summer_has_pro_access();
  paid_active := public.summer_has_paid_access();
  select c.nutrition_generation_limit into limit_value
  from summer_private.plan_config c where c.singleton;
  if pro_active and not paid_active then
    limit_value := 1;
    select t.started_at, t.expires_at
      into period_starts_at, period_ends_at
    from summer_private.pro_trials t
    where t.user_id = account_id and t.expires_at > now();
  else
    limit_value := coalesce(limit_value, 4);
    period_starts_at := date_trunc('month', now());
    period_ends_at := period_starts_at + interval '1 month';
  end if;

  select count(*)::integer into used_value
  from public.summer_nutrition_generations g
  where g.user_id = account_id
    and g.created_at >= period_starts_at
    and g.created_at < period_ends_at
    and (g.status = 'completed'
      or (g.status = 'processing' and g.created_at > now() - interval '15 minutes'));

  return jsonb_build_object(
    'is_pro', pro_active, 'is_trial', pro_active and not paid_active,
    'allowed', pro_active and used_value < limit_value,
    'used', used_value, 'remaining', greatest(0, limit_value - used_value),
    'monthly_limit', limit_value,
    'period_ends_at', period_ends_at,
    'server_time', now()
  );
end;
$$;

create or replace function summer_private.begin_nutrition_ai_action(p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  limit_value integer;
  used_value integer;
  action_id bigint;
begin
  if account_id is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  if p_action <> 'food_photo' then
    raise exception 'Acao de nutricao invalida';
  end if;
  perform 1 from auth.users
    where id = account_id and deleted_at is null and email_confirmed_at is not null
    for update;
  if not found then
    raise exception 'Conta nao encontrada ou e-mail ainda nao confirmado';
  end if;
  if not public.summer_has_pro_access() then
    raise exception 'Recurso exclusivo do Summer PRO' using errcode = '42501';
  end if;

  select c.food_photo_monthly_limit into limit_value
  from summer_private.plan_config c where c.singleton;
  limit_value := coalesce(limit_value, 30);
  select count(*)::integer into used_value
  from public.summer_nutrition_ai_actions a
  where a.user_id = account_id and a.action = 'food_photo'
    and a.created_at >= date_trunc('month', now())
    and a.created_at < date_trunc('month', now()) + interval '1 month'
    and (a.status = 'completed'
      or (a.status = 'processing' and a.created_at > now() - interval '15 minutes'));
  if used_value >= limit_value then
    raise exception 'Limite mensal desta ferramenta atingido';
  end if;

  insert into public.summer_nutrition_ai_actions(user_id, action)
  values (account_id, 'food_photo') returning id into action_id;
  return jsonb_build_object(
    'action_id', action_id, 'used', used_value + 1,
    'remaining', greatest(0, limit_value - used_value - 1),
    'monthly_limit', limit_value,
    'period_ends_at', date_trunc('month', now()) + interval '1 month'
  );
end;
$$;

revoke all on function public.summer_has_pro_access(),
  public.summer_has_paid_access(), public.summer_get_access(),
  public.summer_start_pro_trial() from public, anon;
grant execute on function public.summer_has_pro_access(),
  public.summer_has_paid_access(), public.summer_get_access(),
  public.summer_start_pro_trial() to authenticated;

revoke all on function summer_private.nutrition_access(),
  summer_private.begin_nutrition_ai_action(text)
  from public, anon, authenticated;
grant execute on function summer_private.nutrition_access(),
  summer_private.begin_nutrition_ai_action(text) to authenticated;

commit;
