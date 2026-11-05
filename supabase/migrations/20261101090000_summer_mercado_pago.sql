-- Summer Treinos: checkout automático do Summer PRO pelo Mercado Pago.
-- O navegador nunca escolhe preço nem concede acesso. A preferência nasce de
-- um checkout precificado no banco e somente o webhook autenticado confirma a
-- assinatura, de forma atômica e idempotente.
begin;

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

commit;
