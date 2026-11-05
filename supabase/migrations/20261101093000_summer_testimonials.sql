-- Consent-backed testimonials. Private consent and account data never enter the
-- public projection, and only an administrator can publish or revoke a quote.
begin;

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

commit;
