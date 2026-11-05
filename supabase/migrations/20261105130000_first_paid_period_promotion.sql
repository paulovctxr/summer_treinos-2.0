-- Restrict the launch price to the first paid period of each account.
-- Trials and unapproved requests do not consume the promotion.
begin;

create or replace function summer_private.first_paid_period_eligible()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare account_id uuid := auth.uid();
begin
  if account_id is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  return not (
    exists (select 1 from public.summer_subscriptions s
      where s.user_id = account_id and s.subscription_started_at is not null)
    or exists (select 1 from summer_private.plan_audit a
      where a.student_id = account_id and a.new_subscription_status = 'pro')
    or exists (select 1 from public.summer_subscription_requests r
      where r.user_id = account_id and r.status = 'approved')
    or exists (select 1 from summer_private.payment_checkouts c
      where c.user_id = account_id and c.status = 'approved')
  );
end;
$$;
revoke all on function summer_private.first_paid_period_eligible() from public, anon;
grant execute on function summer_private.first_paid_period_eligible() to authenticated;

create or replace function summer_private.plan_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'free_price_cents', c.free_price_cents,
    'pro_monthly_price_cents', c.pro_monthly_price_cents,
    'pro_annual_price_cents', c.pro_annual_price_cents,
    'promotional_monthly_price_cents', c.promotional_monthly_price_cents,
    'promotion_active', c.promotion_active and summer_private.first_paid_period_eligible(),
    'pix_key', c.pix_key,
    'annual_savings_cents', greatest(
      0,
      c.pro_monthly_price_cents * 12 - c.pro_annual_price_cents
    ),
    'nutrition_generation_limit', c.nutrition_generation_limit,
    'updated_at', c.updated_at
  ) into result
  from summer_private.plan_config c where c.singleton;
  return result;
end;
$$;

create or replace function summer_private.request_subscription(
  p_subscription_plan text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  amount_value integer;
  request_id bigint;
  existing_plan text;
  existing_amount integer;
  config_result jsonb;
begin
  if account_id is null then
    raise exception 'Autenticacao necessaria' using errcode = '42501';
  end if;
  if p_subscription_plan not in ('monthly', 'annual')
    or p_subscription_plan is null then
    raise exception 'Plano invalido';
  end if;
  perform 1 from auth.users
    where id = account_id and deleted_at is null and email_confirmed_at is not null
    for update;
  if not found then
    raise exception 'Confirme seu e-mail antes de solicitar o Summer PRO';
  end if;

  select
    case
      when p_subscription_plan = 'annual' then c.pro_annual_price_cents
      when c.promotion_active and summer_private.first_paid_period_eligible() then c.promotional_monthly_price_cents
      else c.pro_monthly_price_cents
    end
  into amount_value
  from summer_private.plan_config c where c.singleton;

  select r.id, r.subscription_plan, r.amount_cents into request_id, existing_plan, existing_amount
  from public.summer_subscription_requests r
  where r.user_id = account_id and r.status = 'pending'
  for update;

  if request_id is not null and existing_plan = p_subscription_plan then
    config_result := summer_private.plan_config();
    return config_result || jsonb_build_object(
      'request_id', request_id,
      'subscription_plan', existing_plan,
      'amount_cents', existing_amount,
      'status', 'pending'
    );
  end if;

  if request_id is not null then
    update public.summer_subscription_requests
      set status = 'cancelled', updated_at = now()
      where id = request_id and user_id = account_id and status = 'pending';
  end if;

  insert into public.summer_subscription_requests(
    user_id,
    subscription_plan,
    amount_cents
  ) values (
    account_id,
    p_subscription_plan,
    amount_value
  ) returning id into request_id;

  config_result := summer_private.plan_config();
  return config_result || jsonb_build_object(
    'request_id', request_id,
    'subscription_plan', p_subscription_plan,
    'amount_cents', amount_value,
    'status', 'pending'
  );
end;
$$;

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
    when c.promotion_active and summer_private.first_paid_period_eligible() then c.promotional_monthly_price_cents
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

notify pgrst, 'reload schema';
commit;
