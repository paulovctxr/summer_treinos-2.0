-- Summer PRO: executar uma vez no SQL Editor do projeto ntqcvzemkpmpnomdbnen.
-- Requer as migracoes anteriores ja instaladas. Executa tudo em uma transacao.
BEGIN;

-- 20261031120000_summer_pro_trial.sql
-- Summer Treinos: teste gratuito único de sete dias do Summer PRO.
-- O teste não cria nem altera assinaturas pagas. Todos os prazos e permissões
-- são calculados no servidor e os dados PRO continuam preservados após o fim.

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


-- 20261101090000_summer_mercado_pago.sql
-- Summer Treinos: checkout automático do Summer PRO pelo Mercado Pago.
-- O navegador nunca escolhe preço nem concede acesso. A preferência nasce de
-- um checkout precificado no banco e somente o webhook autenticado confirma a
-- assinatura, de forma atômica e idempotente.

create table if not exists summer_private.payment_checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_plan text not null
    check (subscription_plan in ('monthly', 'annual')),
  amount_cents integer not null check (amount_cents between 100 and 10000000),
  currency text not null default 'BRL' check (currency = 'BRL'),
  provider text not null default 'mercado_pago'
    check (provider = 'mercado_pago'),
  status text not null default 'created'
    check (status in ('created', 'pending', 'approved')),
  provider_preference_id text,
  provider_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint summer_payment_checkouts_preference_length check (
    provider_preference_id is null
    or length(provider_preference_id) between 1 and 160
  ),
  constraint summer_payment_checkouts_payment_length check (
    provider_payment_id is null
    or length(provider_payment_id) between 1 and 80
  )
);
create index if not exists summer_payment_checkouts_user_created
  on summer_private.payment_checkouts(user_id, created_at desc);
create unique index if not exists summer_payment_checkouts_preference_unique
  on summer_private.payment_checkouts(provider_preference_id)
  where provider_preference_id is not null;
create unique index if not exists summer_payment_checkouts_payment_unique
  on summer_private.payment_checkouts(provider_payment_id)
  where provider_payment_id is not null;
alter table summer_private.payment_checkouts enable row level security;
revoke all on summer_private.payment_checkouts
  from public, anon, authenticated;

alter table summer_private.plan_audit
  add column if not exists payment_checkout_id uuid
    references summer_private.payment_checkouts(id) on delete set null,
  add column if not exists payment_provider text,
  add column if not exists payment_reference text;

create or replace function summer_private.create_mercado_pago_checkout(
  p_subscription_plan text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  selected_amount integer;
  checkout_id uuid;
begin
  if account_id is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  perform summer_private.require_active_member();

  if p_subscription_plan is null
    or p_subscription_plan not in ('monthly', 'annual') then
    raise exception 'Plano invalido';
  end if;

  perform 1
  from auth.users u
  where u.id = account_id
    and u.deleted_at is null
    and u.email_confirmed_at is not null;
  if not found then
    raise exception 'Conta nao encontrada ou e-mail ainda nao confirmado';
  end if;

  select case
    when p_subscription_plan = 'annual' then c.pro_annual_price_cents
    when c.promotion_active then c.promotional_monthly_price_cents
    else c.pro_monthly_price_cents
  end into selected_amount
  from summer_private.plan_config c
  where c.singleton;

  if selected_amount is null or selected_amount < 100 then
    raise exception 'Preco temporariamente indisponivel';
  end if;

  insert into summer_private.payment_checkouts(
    user_id, subscription_plan, amount_cents
  ) values (
    account_id, p_subscription_plan, selected_amount
  ) returning id into checkout_id;

  return jsonb_build_object(
    'checkout_id', checkout_id,
    'subscription_plan', p_subscription_plan,
    'amount_cents', selected_amount,
    'currency', 'BRL'
  );
end;
$$;
revoke all on function summer_private.create_mercado_pago_checkout(text)
  from public, anon, authenticated;
grant execute on function summer_private.create_mercado_pago_checkout(text)
  to authenticated;

create or replace function public.summer_create_mercado_pago_checkout(
  p_subscription_plan text
) returns jsonb language sql security invoker set search_path = '' as $$
  select summer_private.create_mercado_pago_checkout(p_subscription_plan);
$$;
revoke all on function public.summer_create_mercado_pago_checkout(text)
  from public, anon;
grant execute on function public.summer_create_mercado_pago_checkout(text)
  to authenticated;

create or replace function summer_private.attach_mercado_pago_preference(
  p_checkout_id uuid,
  p_preference_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  checkout_row summer_private.payment_checkouts;
  normalized_preference text := trim(p_preference_id);
begin
  if account_id is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  if p_checkout_id is null
    or p_preference_id is null
    or length(normalized_preference) not between 1 and 160 then
    raise exception 'Preferencia invalida';
  end if;

  select * into checkout_row
  from summer_private.payment_checkouts c
  where c.id = p_checkout_id and c.user_id = account_id
  for update;
  if checkout_row.id is null then
    raise exception 'Checkout nao encontrado' using errcode = '42501';
  end if;
  if checkout_row.status = 'approved' then
    raise exception 'Checkout ja confirmado';
  end if;
  if checkout_row.provider_preference_id is not null
    and checkout_row.provider_preference_id <> normalized_preference then
    raise exception 'Checkout ja associado a outra preferencia';
  end if;

  update summer_private.payment_checkouts
  set provider_preference_id = normalized_preference,
      status = 'pending',
      updated_at = now()
  where id = checkout_row.id;

  return jsonb_build_object(
    'checkout_id', checkout_row.id,
    'status', 'pending'
  );
end;
$$;
revoke all on function summer_private.attach_mercado_pago_preference(uuid,text)
  from public, anon, authenticated;
grant execute on function summer_private.attach_mercado_pago_preference(uuid,text)
  to authenticated;

create or replace function public.summer_attach_mercado_pago_preference(
  p_checkout_id uuid,
  p_preference_id text
) returns jsonb language sql security invoker set search_path = '' as $$
  select summer_private.attach_mercado_pago_preference(
    p_checkout_id, p_preference_id
  );
$$;
revoke all on function public.summer_attach_mercado_pago_preference(uuid,text)
  from public, anon;
grant execute on function public.summer_attach_mercado_pago_preference(uuid,text)
  to authenticated;

create or replace function summer_private.confirm_mercado_pago_payment(
  p_checkout_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text,
  p_provider_status text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  checkout_row summer_private.payment_checkouts;
  previous public.summer_subscriptions;
  normalized_payment_id text := trim(p_provider_payment_id);
  new_started_at timestamptz;
  new_expiration timestamptz;
  duration interval;
begin
  if p_checkout_id is null
    or p_provider_payment_id is null
    or length(normalized_payment_id) not between 1 and 80
    or p_provider_status is distinct from 'approved' then
    raise exception 'Pagamento invalido';
  end if;

  select * into checkout_row
  from summer_private.payment_checkouts c
  where c.id = p_checkout_id
  for update;
  if checkout_row.id is null then
    raise exception 'Checkout nao encontrado';
  end if;

  if checkout_row.amount_cents <> p_amount_cents
    or checkout_row.currency <> p_currency then
    raise exception 'Valor ou moeda divergente';
  end if;

  if checkout_row.status = 'approved' then
    if checkout_row.provider_payment_id = normalized_payment_id then
      select * into previous
      from public.summer_subscriptions s
      where s.user_id = checkout_row.user_id;
      return jsonb_build_object(
        'processed', false,
        'already_processed', true,
        'subscription_status', previous.subscription_status,
        'subscription_plan', previous.subscription_plan,
        'subscription_started_at', previous.subscription_started_at,
        'subscription_expires_at', previous.subscription_expires_at
      );
    end if;
    raise exception 'Checkout ja confirmado com outro pagamento';
  end if;

  if exists (
    select 1 from summer_private.payment_checkouts c
    where c.provider_payment_id = normalized_payment_id
      and c.id <> checkout_row.id
  ) then
    raise exception 'Pagamento ja utilizado';
  end if;

  -- A trava da conta serializa duas compras simultaneas do mesmo aluno.
  perform 1
  from auth.users u
  where u.id = checkout_row.user_id
    and u.deleted_at is null
    and u.email_confirmed_at is not null
  for update;
  if not found then
    raise exception 'Conta nao encontrada ou e-mail ainda nao confirmado';
  end if;

  select * into previous
  from public.summer_subscriptions s
  where s.user_id = checkout_row.user_id
  for update;

  duration := case
    when checkout_row.subscription_plan = 'annual' then interval '1 year'
    else interval '1 month'
  end;
  new_started_at := case
    when previous.subscription_status = 'pro'
      and previous.subscription_expires_at > now()
      then previous.subscription_started_at
    else now()
  end;
  new_expiration := greatest(
    now(),
    case
      when previous.subscription_status = 'pro'
        then coalesce(previous.subscription_expires_at, now())
      else now()
    end
  ) + duration;

  insert into public.summer_subscriptions(
    user_id,
    plan,
    expires_at,
    updated_at,
    updated_by,
    subscription_status,
    subscription_plan,
    subscription_started_at,
    subscription_expires_at,
    subscription_updated_at
  ) values (
    checkout_row.user_id,
    'plus',
    new_expiration,
    now(),
    null,
    'pro',
    checkout_row.subscription_plan,
    new_started_at,
    new_expiration,
    now()
  ) on conflict (user_id) do update set
    plan = excluded.plan,
    expires_at = excluded.expires_at,
    updated_at = now(),
    updated_by = null,
    subscription_status = excluded.subscription_status,
    subscription_plan = excluded.subscription_plan,
    subscription_started_at = excluded.subscription_started_at,
    subscription_expires_at = excluded.subscription_expires_at,
    subscription_updated_at = now();

  update summer_private.payment_checkouts
  set status = 'approved',
      provider_payment_id = normalized_payment_id,
      approved_at = now(),
      updated_at = now()
  where id = checkout_row.id;

  insert into summer_private.plan_audit(
    admin_id,
    student_id,
    action,
    old_plan,
    new_plan,
    old_expires_at,
    new_expires_at,
    old_subscription_status,
    new_subscription_status,
    old_subscription_plan,
    new_subscription_plan,
    amount_cents,
    payment_checkout_id,
    payment_provider,
    payment_reference
  ) values (
    null,
    checkout_row.user_id,
    'mercado_pago_approve',
    previous.plan,
    'plus',
    previous.subscription_expires_at,
    new_expiration,
    previous.subscription_status,
    'pro',
    previous.subscription_plan,
    checkout_row.subscription_plan,
    checkout_row.amount_cents,
    checkout_row.id,
    'mercado_pago',
    normalized_payment_id
  );

  return jsonb_build_object(
    'processed', true,
    'already_processed', false,
    'subscription_status', 'pro',
    'subscription_plan', checkout_row.subscription_plan,
    'subscription_started_at', new_started_at,
    'subscription_expires_at', new_expiration
  );
end;
$$;
revoke all on function summer_private.confirm_mercado_pago_payment(
  uuid,text,integer,text,text
) from public, anon, authenticated;
grant usage on schema summer_private to service_role;
grant execute on function summer_private.confirm_mercado_pago_payment(
  uuid,text,integer,text,text
) to service_role;

-- O wrapper publico continua SECURITY INVOKER. Somente a role de servidor tem
-- EXECUTE nele e na funcao privada que realiza a transacao.
create or replace function public.summer_confirm_mercado_pago_payment(
  p_checkout_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text,
  p_provider_status text
) returns jsonb language sql security invoker set search_path = '' as $$
  select summer_private.confirm_mercado_pago_payment(
    p_checkout_id,
    p_provider_payment_id,
    p_amount_cents,
    p_currency,
    p_provider_status
  );
$$;
revoke all on function public.summer_confirm_mercado_pago_payment(
  uuid,text,integer,text,text
) from public, anon, authenticated;
grant execute on function public.summer_confirm_mercado_pago_payment(
  uuid,text,integer,text,text
) to service_role;


-- 20261101091000_summer_pro_conversion_events.sql
-- Summer Fit: privacy-conscious aggregate funnel for Summer PRO.
-- Only an allowlisted event, a bounded screen source and an optional referral
-- code are stored. Names, e-mails, workout data and nutrition data are never
-- accepted by this interface.

create table if not exists summer_private.pro_conversion_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in (
    'offer_viewed', 'trial_started', 'pro_feature_opened',
    'checkout_opened', 'mercado_pago_opened', 'pix_copied',
    'whatsapp_clicked', 'subscription_requested',
    'subscription_approved'
  )),
  source text not null default 'unknown' check (source in (
    'home', 'progress', 'nutrition', 'paywall', 'plans', 'checkout',
    'mercado_pago', 'whatsapp', 'trial', 'referral', 'system', 'unknown'
  )),
  referral_code text check (
    referral_code is null or referral_code ~ '^[a-z0-9][a-z0-9-]{0,39}$'
  ),
  created_at timestamptz not null default now()
);
create index if not exists summer_pro_conversion_events_created
  on summer_private.pro_conversion_events(created_at desc);
create index if not exists summer_pro_conversion_events_name_created
  on summer_private.pro_conversion_events(event_name, created_at desc);
create index if not exists summer_pro_conversion_events_user_created
  on summer_private.pro_conversion_events(user_id, created_at desc);
alter table summer_private.pro_conversion_events enable row level security;
revoke all on summer_private.pro_conversion_events
  from public, anon, authenticated;

create or replace function summer_private.log_pro_conversion_event(
  p_user_id uuid,
  p_event_name text,
  p_source text default 'system',
  p_referral_code text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  normalized_source text := coalesce(nullif(lower(trim(p_source)), ''), 'unknown');
  normalized_referral text := nullif(lower(trim(p_referral_code)), '');
  inserted boolean := false;
begin
  -- The helper is shared with server-side lifecycle triggers. When it is
  -- called directly, a member can only attribute an event to their own id;
  -- administrators and the service role may record trusted server events.
  if auth.uid() is distinct from p_user_id
    and not summer_private.is_admin()
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
  then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (
    select 1 from auth.users u
    where u.id = p_user_id and u.deleted_at is null
  ) then
    raise exception 'Conta invalida';
  end if;
  if p_event_name not in (
    'offer_viewed', 'trial_started', 'pro_feature_opened',
    'checkout_opened', 'mercado_pago_opened', 'pix_copied',
    'whatsapp_clicked', 'subscription_requested',
    'subscription_approved'
  ) then raise exception 'Evento invalido'; end if;
  if normalized_source not in (
    'home', 'progress', 'nutrition', 'paywall', 'plans', 'checkout',
    'mercado_pago', 'whatsapp', 'trial', 'referral', 'system', 'unknown'
  ) then raise exception 'Origem invalida'; end if;
  if normalized_referral is not null
    and normalized_referral !~ '^[a-z0-9][a-z0-9-]{0,39}$'
  then raise exception 'Indicacao invalida'; end if;

  -- Repeated focus/click events in a short interval do not inflate the funnel.
  insert into summer_private.pro_conversion_events(
    user_id, event_name, source, referral_code
  )
  select p_user_id, p_event_name, normalized_source, normalized_referral
  where not exists (
    select 1 from summer_private.pro_conversion_events e
    where e.user_id = p_user_id
      and e.event_name = p_event_name
      and (
        p_event_name in (
          'trial_started', 'subscription_requested', 'subscription_approved'
        )
        or (
          e.source = normalized_source
          and e.referral_code is not distinct from normalized_referral
        )
      )
      and e.created_at > now() - interval '5 minutes'
  );
  inserted := found;
  return inserted;
end;
$$;
revoke all on function summer_private.log_pro_conversion_event(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function summer_private.log_pro_conversion_event(uuid,text,text,text)
  to authenticated;

create or replace function public.summer_log_pro_conversion_event(
  p_event_name text,
  p_source text default 'unknown',
  p_referral_code text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  perform summer_private.require_active_member();
  return summer_private.log_pro_conversion_event(
    auth.uid(), p_event_name, p_source, p_referral_code
  );
end;
$$;
revoke all on function public.summer_log_pro_conversion_event(text,text,text)
  from public, anon;
grant execute on function public.summer_log_pro_conversion_event(text,text,text)
  to authenticated;

create or replace function summer_private.admin_pro_conversion_funnel(
  p_days integer default 30
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not summer_private.is_admin() then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'Periodo invalido';
  end if;

  with period_events as (
    select e.event_name, e.user_id, e.created_at
    from summer_private.pro_conversion_events e
    where e.created_at >= now() - make_interval(days => p_days)
  ), event_counts as (
    select
      count(*) filter (where event_name = 'offer_viewed')::integer as offer_events,
      count(distinct user_id) filter (where event_name = 'pro_feature_opened')::integer as feature_users,
      count(distinct user_id)::integer as reached_users,
      count(*)::integer as total_events
    from period_events
  ), user_stages as (
    select user_id,
      min(created_at) filter (where event_name = 'offer_viewed') as offer_at,
      min(created_at) filter (where event_name = 'trial_started') as trial_at,
      min(created_at) filter (where event_name in (
        'checkout_opened', 'mercado_pago_opened', 'pix_copied',
        'whatsapp_clicked', 'subscription_requested'
      )) as checkout_at,
      min(created_at) filter (where event_name = 'subscription_approved') as paid_at
    from period_events
    group by user_id
  ), stage_counts as (
    select
      count(*) filter (where offer_at is not null)::integer as offers,
      count(*) filter (where trial_at is not null)::integer as trials,
      count(*) filter (where checkout_at is not null)::integer as checkouts,
      count(*) filter (where paid_at is not null)::integer as paid,
      count(*) filter (
        where offer_at is not null and trial_at is not null
      )::integer as offer_trial_conversions,
      count(*) filter (
        where trial_at is not null and checkout_at is not null
      )::integer as trial_checkout_conversions,
      count(*) filter (
        where checkout_at is not null and paid_at is not null
      )::integer as checkout_paid_conversions
    from user_stages
  )
  select jsonb_build_object(
    'period_days', p_days,
    'from', now() - make_interval(days => p_days),
    'to', now(),
    'events', jsonb_build_object(
      'total', total_events,
      'offer_views', offer_events,
      'unique_users', reached_users,
      'pro_feature_users', feature_users
    ),
    'funnel', jsonb_build_object(
      'offers', offers,
      'trials', trials,
      'checkouts', checkouts,
      'paid', paid,
      'offer_to_trial_rate', case when offers > 0
        then round(offer_trial_conversions::numeric * 100 / offers, 1) else 0 end,
      'trial_to_checkout_rate', case when trials > 0
        then round(trial_checkout_conversions::numeric * 100 / trials, 1) else 0 end,
      'checkout_to_paid_rate', case when checkouts > 0
        then round(checkout_paid_conversions::numeric * 100 / checkouts, 1) else 0 end
    )
  ) into result from event_counts cross join stage_counts;
  return result;
end;
$$;
revoke all on function summer_private.admin_pro_conversion_funnel(integer)
  from public, anon, authenticated;
grant execute on function summer_private.admin_pro_conversion_funnel(integer)
  to authenticated;

create or replace function public.summer_admin_pro_conversion_funnel(
  p_days integer default 30
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select summer_private.admin_pro_conversion_funnel(p_days);
$$;
revoke all on function public.summer_admin_pro_conversion_funnel(integer)
  from public, anon;
grant execute on function public.summer_admin_pro_conversion_funnel(integer)
  to authenticated;

-- Server-side lifecycle events remain reliable even if the member closes the
-- browser before a client-side event is sent.
create or replace function summer_private.capture_pro_trial_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform summer_private.log_pro_conversion_event(
    new.user_id, 'trial_started', 'system', null
  );
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists summer_capture_pro_trial_event
  on summer_private.pro_trials;
create trigger summer_capture_pro_trial_event
  after insert on summer_private.pro_trials
  for each row execute function summer_private.capture_pro_trial_event();

create or replace function summer_private.capture_subscription_request_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform summer_private.log_pro_conversion_event(
    new.user_id, 'subscription_requested', 'system', null
  );
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists summer_capture_subscription_request_event
  on public.summer_subscription_requests;
create trigger summer_capture_subscription_request_event
  after insert on public.summer_subscription_requests
  for each row execute function summer_private.capture_subscription_request_event();

create or replace function summer_private.capture_subscription_approved_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.subscription_status = 'pro'
    and (tg_op = 'INSERT' or old.subscription_status is distinct from 'pro')
  then
    perform summer_private.log_pro_conversion_event(
      new.user_id, 'subscription_approved', 'system', null
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists summer_capture_subscription_approved_event
  on public.summer_subscriptions;
create trigger summer_capture_subscription_approved_event
  after insert or update of subscription_status on public.summer_subscriptions
  for each row execute function summer_private.capture_subscription_approved_event();


-- 20261101092000_summer_referrals.sql
-- Summer Fit: attribution for gym reception/evaluation invitations.
-- Codes are operational labels, never personal data or authorization secrets.

create table if not exists summer_private.referral_codes (
  code text primary key check (code ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  label text not null check (length(trim(label)) between 2 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create table if not exists summer_private.user_referrals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null references summer_private.referral_codes(code),
  attached_at timestamptz not null default now()
);
create index if not exists summer_user_referrals_code_attached
  on summer_private.user_referrals(code, attached_at desc);
alter table summer_private.referral_codes enable row level security;
alter table summer_private.user_referrals enable row level security;
revoke all on summer_private.referral_codes,
  summer_private.user_referrals from public, anon, authenticated;
-- Anonymous visitors can resolve only the explicitly granted lookup helper.
-- Schema usage does not grant access to its tables or any other function.
grant usage on schema summer_private to anon;

insert into summer_private.referral_codes(code, label)
values ('recepcao', 'Recepção da academia'), ('avaliacao', 'Avaliação física')
on conflict (code) do nothing;

create or replace function summer_private.public_referral(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('valid', true, 'code', c.code, 'label', c.label)
    from summer_private.referral_codes c
    where c.code = lower(trim(p_code)) and c.active
      and length(p_code) <= 32
  ), jsonb_build_object('valid', false));
$$;
revoke all on function summer_private.public_referral(text)
  from public, anon, authenticated;
grant execute on function summer_private.public_referral(text) to anon, authenticated;

create or replace function public.summer_public_referral(p_code text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select summer_private.public_referral(p_code);
$$;
revoke all on function public.summer_public_referral(text) from public;
grant execute on function public.summer_public_referral(text) to anon, authenticated;

create or replace function summer_private.attach_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  normalized text := lower(trim(p_code));
  existing text;
  inserted integer;
begin
  if account_id is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  perform summer_private.require_active_member();
  if normalized is null
    or normalized !~ '^[a-z0-9][a-z0-9-]{1,31}$' or not exists (
    select 1 from summer_private.referral_codes c
    where c.code = normalized and c.active
  ) then raise exception 'Codigo de indicacao invalido'; end if;

  insert into summer_private.user_referrals(user_id, code)
  values (account_id, normalized) on conflict (user_id) do nothing;
  get diagnostics inserted = row_count;
  select r.code into existing from summer_private.user_referrals r
  where r.user_id = account_id;
  return jsonb_build_object(
    'attached', inserted = 1,
    'already_attributed', inserted = 0,
    'code', existing
  );
end;
$$;
revoke all on function summer_private.attach_referral(text)
  from public, anon, authenticated;
grant execute on function summer_private.attach_referral(text) to authenticated;

create or replace function public.summer_attach_referral(p_code text)
returns jsonb language sql security invoker set search_path = '' as $$
  select summer_private.attach_referral(p_code);
$$;
revoke all on function public.summer_attach_referral(text) from public, anon;
grant execute on function public.summer_attach_referral(text) to authenticated;

create or replace function summer_private.capture_signup_referral()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested text := lower(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
begin
  if requested ~ '^[a-z0-9][a-z0-9-]{1,31}$' and exists (
    select 1 from summer_private.referral_codes c
    where c.code = requested and c.active
  ) then
    insert into summer_private.user_referrals(user_id, code)
    values (new.id, requested) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function summer_private.capture_signup_referral()
  from public, anon, authenticated;
drop trigger if exists summer_capture_signup_referral on auth.users;
create trigger summer_capture_signup_referral after insert on auth.users
  for each row execute function summer_private.capture_signup_referral();

create or replace function summer_private.admin_set_referral(
  p_code text, p_label text, p_active boolean default true
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare normalized text := lower(trim(p_code));
begin
  if not summer_private.is_admin() then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
  if normalized is null or normalized !~ '^[a-z0-9][a-z0-9-]{1,31}$'
    or p_label is null or length(trim(p_label)) not between 2 and 80
    or p_active is null then
    raise exception 'Dados de indicacao invalidos';
  end if;
  insert into summer_private.referral_codes(code, label, active, created_by)
  values (normalized, trim(p_label), p_active, auth.uid())
  on conflict (code) do update set label = excluded.label, active = excluded.active;
  return jsonb_build_object('code', normalized, 'label', trim(p_label), 'active', p_active);
end;
$$;
revoke all on function summer_private.admin_set_referral(text,text,boolean)
  from public, anon, authenticated;
grant execute on function summer_private.admin_set_referral(text,text,boolean)
  to authenticated;

create or replace function public.summer_admin_set_referral(
  p_code text, p_label text, p_active boolean default true
) returns jsonb language sql security invoker set search_path = '' as $$
  select summer_private.admin_set_referral(p_code, p_label, p_active);
$$;
revoke all on function public.summer_admin_set_referral(text,text,boolean)
  from public, anon;
grant execute on function public.summer_admin_set_referral(text,text,boolean)
  to authenticated;

create or replace function summer_private.admin_referral_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not summer_private.is_admin() then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'codes', coalesce(jsonb_agg(jsonb_build_object(
      'code', x.code, 'label', x.label, 'active', x.active,
      'referred_accounts', x.referred_accounts,
      'trial_starts', x.trial_starts,
      'paid_accounts', x.paid_accounts
    ) order by x.referred_accounts desc, x.code), '[]'::jsonb),
    'server_time', now()
  ) into result from (
    select c.code, c.label, c.active,
      count(r.user_id)::integer as referred_accounts,
      count(t.user_id)::integer as trial_starts,
      count(s.user_id) filter (where s.subscription_started_at is not null)::integer as paid_accounts
    from summer_private.referral_codes c
    left join summer_private.user_referrals r on r.code = c.code
    left join summer_private.pro_trials t on t.user_id = r.user_id
    left join public.summer_subscriptions s on s.user_id = r.user_id
    group by c.code, c.label, c.active
  ) x;
  return coalesce(result, jsonb_build_object('codes', '[]'::jsonb, 'server_time', now()));
end;
$$;
revoke all on function summer_private.admin_referral_summary()
  from public, anon, authenticated;
grant execute on function summer_private.admin_referral_summary() to authenticated;

create or replace function public.summer_admin_referral_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select summer_private.admin_referral_summary();
$$;
revoke all on function public.summer_admin_referral_summary() from public, anon;
grant execute on function public.summer_admin_referral_summary() to authenticated;


-- 20261101093000_summer_testimonials.sql
-- Consent-backed testimonials. Private consent and account data never enter the
-- public projection, and only an administrator can publish or revoke a quote.

create table if not exists summer_private.pro_testimonials (
  id bigint generated always as identity primary key,
  member_user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  display_label text,
  quote text not null,
  status text not null default 'draft',
  consented_at timestamptz not null,
  consent_method text not null,
  source_note text,
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_testimonials_display_name_length
    check (char_length(display_name) between 1 and 40),
  constraint pro_testimonials_display_label_length
    check (display_label is null or char_length(display_label) between 2 and 60),
  constraint pro_testimonials_quote_length
    check (char_length(quote) between 20 and 400),
  constraint pro_testimonials_status
    check (status in ('draft', 'published', 'revoked')),
  constraint pro_testimonials_consent_method
    check (consent_method in ('formulario', 'whatsapp', 'presencial', 'email', 'outro')),
  constraint pro_testimonials_source_note_length
    check (source_note is null or char_length(source_note) <= 500),
  constraint pro_testimonials_publication_audit
    check (status <> 'published' or (published_at is not null and published_by is not null))
);

alter table summer_private.pro_testimonials enable row level security;
revoke all on table summer_private.pro_testimonials from public, anon, authenticated;
revoke all on sequence summer_private.pro_testimonials_id_seq from public, anon, authenticated;

-- This table is a deliberately narrow public projection. It contains no
-- account identifier, source note, consent record or administrator identifier.
create table if not exists public.summer_published_testimonials (
  testimonial_id bigint primary key
    references summer_private.pro_testimonials(id) on delete cascade,
  display_name text not null,
  display_label text,
  quote text not null,
  published_at timestamptz not null,
  constraint summer_published_testimonials_name_length
    check (char_length(display_name) between 1 and 40),
  constraint summer_published_testimonials_label_length
    check (display_label is null or char_length(display_label) between 2 and 60),
  constraint summer_published_testimonials_quote_length
    check (char_length(quote) between 20 and 400)
);

alter table public.summer_published_testimonials enable row level security;
drop policy if exists summer_published_testimonials_read on public.summer_published_testimonials;
create policy summer_published_testimonials_read
  on public.summer_published_testimonials for select
  to anon, authenticated
  using (true);

revoke all on table public.summer_published_testimonials from public, anon, authenticated;
grant select (display_name, display_label, quote, published_at)
  on table public.summer_published_testimonials to anon, authenticated;

create index if not exists pro_testimonials_status_created
  on summer_private.pro_testimonials(status, created_at desc);
create index if not exists summer_published_testimonials_published
  on public.summer_published_testimonials(published_at desc);

create or replace function public.summer_get_pro_testimonials()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'display_name', published.display_name,
        'display_label', published.display_label,
        'quote', published.quote,
        'published_at', published.published_at
      ) order by published.published_at desc, published.display_name
    ),
    '[]'::jsonb
  )
  from (
    select t.display_name, t.display_label, t.quote, t.published_at
    from public.summer_published_testimonials t
    order by t.published_at desc, t.display_name
    limit 12
  ) published;
$$;
revoke all on function public.summer_get_pro_testimonials() from public;
grant execute on function public.summer_get_pro_testimonials() to anon, authenticated;

create or replace function summer_private.admin_testimonials()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not summer_private.is_admin() then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'testimonials', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'display_name', t.display_name,
          'display_label', t.display_label,
          'quote', t.quote,
          'status', t.status,
          'consented_at', t.consented_at,
          'consent_method', t.consent_method,
          'created_at', t.created_at,
          'published_at', t.published_at
        ) order by t.created_at desc, t.id desc
      ),
      '[]'::jsonb
    ),
    'server_time', now()
  ) into result
  from summer_private.pro_testimonials t;

  return result;
end;
$$;
revoke all on function summer_private.admin_testimonials() from public, anon, authenticated;
grant execute on function summer_private.admin_testimonials() to authenticated;

create or replace function public.summer_admin_testimonials()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select summer_private.admin_testimonials();
$$;
revoke all on function public.summer_admin_testimonials() from public, anon;
grant execute on function public.summer_admin_testimonials() to authenticated;

create or replace function summer_private.admin_create_testimonial(
  p_display_name text,
  p_display_label text,
  p_quote text,
  p_consented_at timestamptz,
  p_consent_method text,
  p_consent_confirmed boolean,
  p_member_user_id uuid default null,
  p_source_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  normalized_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '[[:space:]]+', ' ', 'g');
  normalized_label text := nullif(regexp_replace(btrim(coalesce(p_display_label, '')), '[[:space:]]+', ' ', 'g'), '');
  normalized_quote text := regexp_replace(btrim(coalesce(p_quote, '')), '[[:space:]]+', ' ', 'g');
  normalized_source text := nullif(btrim(coalesce(p_source_note, '')), '');
  created summer_private.pro_testimonials;
begin
  if not summer_private.is_admin() then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
  if p_consent_confirmed is distinct from true or p_consented_at is null then
    raise exception 'Confirme a autorizacao expressa da pessoa';
  end if;
  if p_consented_at > now() + interval '5 minutes' then
    raise exception 'A data do consentimento nao pode estar no futuro';
  end if;
  if char_length(normalized_name) not between 1 and 40
    or normalized_name !~ '^[A-Za-zÀ-ÖØ-öø-ÿ''-]+( [A-Za-zÀ-ÖØ-öø-ÿ''-]+)?$' then
    raise exception 'Informe somente o primeiro nome, com no maximo duas palavras';
  end if;
  if normalized_label is not null and char_length(normalized_label) not between 2 and 60 then
    raise exception 'A identificacao geral deve ter entre 2 e 60 caracteres';
  end if;
  if char_length(normalized_quote) not between 20 and 400 then
    raise exception 'O depoimento deve ter entre 20 e 400 caracteres';
  end if;
  if p_consent_method is null
    or p_consent_method not in ('formulario', 'whatsapp', 'presencial', 'email', 'outro') then
    raise exception 'Informe como a autorizacao foi registrada';
  end if;
  if normalized_source is not null and char_length(normalized_source) > 500 then
    raise exception 'A anotacao interna deve ter no maximo 500 caracteres';
  end if;
  if p_member_user_id is not null and not exists (
    select 1 from auth.users u where u.id = p_member_user_id and u.deleted_at is null
  ) then
    raise exception 'Aluno nao encontrado';
  end if;

  insert into summer_private.pro_testimonials(
    member_user_id,
    display_name,
    display_label,
    quote,
    consented_at,
    consent_method,
    source_note,
    created_by
  ) values (
    p_member_user_id,
    normalized_name,
    normalized_label,
    normalized_quote,
    p_consented_at,
    p_consent_method,
    normalized_source,
    auth.uid()
  ) returning * into created;

  return jsonb_build_object(
    'id', created.id,
    'display_name', created.display_name,
    'display_label', created.display_label,
    'quote', created.quote,
    'status', created.status,
    'consented_at', created.consented_at,
    'consent_method', created.consent_method,
    'created_at', created.created_at,
    'published_at', created.published_at
  );
end;
$$;
revoke all on function summer_private.admin_create_testimonial(text,text,text,timestamptz,text,boolean,uuid,text)
  from public, anon, authenticated;
grant execute on function summer_private.admin_create_testimonial(text,text,text,timestamptz,text,boolean,uuid,text)
  to authenticated;

create or replace function public.summer_admin_create_testimonial(
  p_display_name text,
  p_display_label text,
  p_quote text,
  p_consented_at timestamptz,
  p_consent_method text,
  p_consent_confirmed boolean,
  p_member_user_id uuid default null,
  p_source_note text default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select summer_private.admin_create_testimonial(
    p_display_name,
    p_display_label,
    p_quote,
    p_consented_at,
    p_consent_method,
    p_consent_confirmed,
    p_member_user_id,
    p_source_note
  );
$$;
revoke all on function public.summer_admin_create_testimonial(text,text,text,timestamptz,text,boolean,uuid,text)
  from public, anon;
grant execute on function public.summer_admin_create_testimonial(text,text,text,timestamptz,text,boolean,uuid,text)
  to authenticated;

create or replace function summer_private.admin_set_testimonial_status(
  p_testimonial_id bigint,
  p_status text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item summer_private.pro_testimonials;
begin
  if not summer_private.is_admin() then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('published', 'revoked') then
    raise exception 'Status de depoimento invalido';
  end if;

  select * into item
  from summer_private.pro_testimonials t
  where t.id = p_testimonial_id
  for update;
  if not found then
    raise exception 'Depoimento nao encontrado';
  end if;

  if p_status = 'published' then
    update summer_private.pro_testimonials t set
      status = 'published',
      published_by = auth.uid(),
      published_at = now(),
      updated_at = now()
    where t.id = p_testimonial_id
    returning * into item;

    insert into public.summer_published_testimonials(
      testimonial_id,
      display_name,
      display_label,
      quote,
      published_at
    ) values (
      item.id,
      item.display_name,
      item.display_label,
      item.quote,
      item.published_at
    ) on conflict (testimonial_id) do update set
      display_name = excluded.display_name,
      display_label = excluded.display_label,
      quote = excluded.quote,
      published_at = excluded.published_at;
  else
    update summer_private.pro_testimonials t set
      status = 'revoked',
      updated_at = now()
    where t.id = p_testimonial_id
    returning * into item;
    delete from public.summer_published_testimonials t
    where t.testimonial_id = p_testimonial_id;
  end if;

  return jsonb_build_object(
    'id', item.id,
    'display_name', item.display_name,
    'display_label', item.display_label,
    'quote', item.quote,
    'status', item.status,
    'consented_at', item.consented_at,
    'consent_method', item.consent_method,
    'created_at', item.created_at,
    'published_at', item.published_at
  );
end;
$$;
revoke all on function summer_private.admin_set_testimonial_status(bigint,text)
  from public, anon, authenticated;
grant execute on function summer_private.admin_set_testimonial_status(bigint,text)
  to authenticated;

create or replace function public.summer_admin_set_testimonial_status(
  p_testimonial_id bigint,
  p_status text
) returns jsonb language sql security invoker set search_path = '' as $$
  select summer_private.admin_set_testimonial_status(p_testimonial_id, p_status);
$$;
revoke all on function public.summer_admin_set_testimonial_status(bigint,text)
  from public, anon;
grant execute on function public.summer_admin_set_testimonial_status(bigint,text)
  to authenticated;


NOTIFY pgrst, 'reload schema';
COMMIT;
