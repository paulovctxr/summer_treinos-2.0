-- Summer Fit: privacy-conscious aggregate funnel for Summer PRO.
-- Only an allowlisted event, a bounded screen source and an optional referral
-- code are stored. Names, e-mails, workout data and nutrition data are never
-- accepted by this interface.
begin;

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

commit;
