-- Summer Fit: attribution for gym reception/evaluation invitations.
-- Codes are operational labels, never personal data or authorization secrets.
begin;

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

commit;
