-- Assessments can be published to the professor folder before the student creates an account.
begin;

create or replace function summer_private.assessment_visible_to_student(a summer_private.assessments) returns boolean
language sql stable security definer set search_path='' as $$
  select a.status='published' and (
    a.student_id=auth.uid()
    or exists(
      select 1 from public.summer_academy_memberships m
      join auth.users u on u.id=m.user_id
      where m.user_id=auth.uid()
        and m.registration=a.registration
        and m.status='active'
        and u.deleted_at is null
        and u.email_confirmed_at is not null
        and not exists(select 1 from summer_private.assessment_team t where t.user_id=u.id)
    )
  );
$$;
revoke all on function summer_private.assessment_visible_to_student(summer_private.assessments) from public,anon;
grant execute on function summer_private.assessment_visible_to_student(summer_private.assessments) to authenticated;

-- Keep the existing validation and change only the publish gate: an unlinked record
-- must carry a four-digit registration so it can become visible after signup.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('summer_private.summer_assessment_save(jsonb,integer,boolean)'::regprocedure) into definition;
  definition:=replace(
    definition,
    $old$if p_publish and (not valid_student or $old$,
    $new$if p_publish and ((student is null and coalesce(p_record->>'registration','') !~ '^[0-9]{4}$') or $new$
  );
  if definition is null or position($needle$if p_publish and ((student is null and coalesce(p_record->>'registration','') !~ '^[0-9]{4}$') or $needle$ in definition)=0 then
    raise exception 'Não foi possível atualizar a publicação de avaliações.';
  end if;
  execute definition;
end;
$migration$;

create or replace function summer_private.summer_assessment_list(p_offset integer default 0, p_search text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; staff boolean:=summer_private.can_assess();
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_offset<0 or p_offset>100000 or length(p_search)>120 then raise exception 'Filtro inválido.'; end if;
  select coalesce(jsonb_agg(to_jsonb(a)-'data'-'created_by' order by a.assessed_on desc,a.updated_at desc),'[]') into result from (
    select * from summer_private.assessments a where
    (staff or summer_private.assessment_visible_to_student(a))
    and (p_search='' or position(lower(p_search) in lower(a.student_name))>0 or position(p_search in a.registration)>0)
    order by a.assessed_on desc,a.updated_at desc limit 30 offset p_offset
  ) a;
  return result;
end;
$$;

create or replace function summer_private.summer_assessment_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select to_jsonb(a)-'created_by' into result from summer_private.assessments a where a.id=p_id
    and (summer_private.can_assess() or summer_private.assessment_visible_to_student(a));
  if result is null then raise exception 'Avaliação indisponível.'; end if;
  return result;
end;
$$;

create or replace function summer_private.assessment_notice() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  return (select jsonb_build_object('unread',count(*) filter(where viewed_at is null),'total',count(*))
    from summer_private.assessments a where summer_private.assessment_visible_to_student(a));
end;
$$;

create or replace function summer_private.assessment_seen(p_id uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare seen timestamptz;
begin
  update summer_private.assessments a set viewed_at=coalesce(a.viewed_at,now())
    where a.id=p_id and summer_private.assessment_visible_to_student(a) returning a.viewed_at into seen;
  if not found then raise exception 'Avaliação indisponível.' using errcode='42501'; end if;
  return seen;
end;
$$;

notify pgrst, 'reload schema';
commit;
