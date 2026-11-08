-- Remove assessments from active use while keeping a private removal record.
-- No evaluation is removed by running this migration.
begin;
create table if not exists summer_private.assessment_removals (
  id uuid primary key,
  snapshot jsonb not null,
  removed_at timestamptz not null default now(),
  removed_by uuid references auth.users(id) on delete set null
);
alter table summer_private.assessment_removals enable row level security;
revoke all on summer_private.assessment_removals from public,anon,authenticated;

create or replace function summer_private.assessment_instructor_key(p_name text) returns text
language sql immutable set search_path='' as $$
  select lower(regexp_replace(normalize(btrim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g')), NFD), U&'[\0300-\036f]', '', 'g'));
$$;
revoke all on function summer_private.assessment_instructor_key(text) from public,anon,authenticated;

create or replace function summer_private.block_removed_assessment_recreation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from summer_private.assessment_removals where id=new.id) then
    raise exception 'Esta avaliação foi removida. Reabra a lista de avaliações.' using errcode='40001';
  end if;
  return new;
end;
$$;
revoke all on function summer_private.block_removed_assessment_recreation() from public,anon,authenticated;
drop trigger if exists assessment_prevent_recreation on summer_private.assessments;
create trigger assessment_prevent_recreation before insert on summer_private.assessments
for each row execute function summer_private.block_removed_assessment_recreation();

create or replace function summer_private.remove_assessment(p_id uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing summer_private.assessments;
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if p_id is null or p_revision is null or p_revision<1 then raise exception 'Avaliação inválida.' using errcode='22023'; end if;
  select * into existing from summer_private.assessments where id=p_id for update;
  if not found or existing.revision<>p_revision then
    raise exception 'A avaliação mudou ou já foi removida. Atualize a lista antes de continuar.' using errcode='40001';
  end if;
  with removed as (delete from summer_private.assessments where id=p_id returning *)
    insert into summer_private.assessment_removals(id,snapshot,removed_by)
      select id,to_jsonb(removed),auth.uid() from removed;
  return jsonb_build_object('removed',1);
end;
$$;
revoke all on function summer_private.remove_assessment(uuid,integer) from public,anon;
grant execute on function summer_private.remove_assessment(uuid,integer) to authenticated;
create or replace function public.summer_assessment_remove(p_id uuid,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$
  select summer_private.remove_assessment(p_id,p_revision);
$$;
revoke all on function public.summer_assessment_remove(uuid,integer) from public,anon;
grant execute on function public.summer_assessment_remove(uuid,integer) to authenticated;

create or replace function summer_private.remove_assessment_folder(p_instructor text,p_expected jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actual jsonb; expected jsonb; removed_count integer;
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if p_instructor is null or length(p_instructor)>120 or p_expected is null or jsonb_typeof(p_expected)<>'array' then
    raise exception 'Pasta inválida.' using errcode='22023';
  end if;
  if jsonb_array_length(p_expected)<1 or jsonb_array_length(p_expected)>100000 then raise exception 'Confira as avaliações da pasta.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('id',(x->>'id')::uuid,'revision',(x->>'revision')::integer) order by (x->>'id')::uuid)
    into expected from jsonb_array_elements(p_expected) x;
  -- Lock exactly the current records. A new record created after this snapshot is never deleted.
  select jsonb_agg(jsonb_build_object('id',a.id,'revision',a.revision) order by a.id) into actual from (
    select id,revision from summer_private.assessments
    where summer_private.assessment_instructor_key(instructor)=summer_private.assessment_instructor_key(p_instructor)
    order by id for update
  ) a;
  if actual is null or actual is distinct from expected then
    raise exception 'A pasta mudou. Atualize a lista e confira as avaliações antes de remover.' using errcode='40001';
  end if;
  with removed as (
    delete from summer_private.assessments where id in (select (x->>'id')::uuid from jsonb_array_elements(actual) x) returning *
  ) insert into summer_private.assessment_removals(id,snapshot,removed_by)
    select id,to_jsonb(removed),auth.uid() from removed;
  get diagnostics removed_count = row_count;
  return jsonb_build_object('removed',removed_count);
end;
$$;
revoke all on function summer_private.remove_assessment_folder(text,jsonb) from public,anon;
grant execute on function summer_private.remove_assessment_folder(text,jsonb) to authenticated;
create or replace function public.summer_assessment_remove_folder(p_instructor text,p_expected jsonb) returns jsonb
language sql security invoker set search_path='' as $$
  select summer_private.remove_assessment_folder(p_instructor,p_expected);
$$;
revoke all on function public.summer_assessment_remove_folder(text,jsonb) from public,anon;
grant execute on function public.summer_assessment_remove_folder(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
