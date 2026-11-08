-- Enables explicit, staff-only permanent deletion of records already in the trash.
-- Applying this migration does not delete any assessment.
begin;
create table if not exists summer_private.assessment_deleted_ids (id uuid primary key);
alter table summer_private.assessment_deleted_ids enable row level security;
revoke all on summer_private.assessment_deleted_ids from public,anon,authenticated;

create or replace function summer_private.block_removed_assessment_recreation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from summer_private.assessment_removals where id=new.id)
    or exists(select 1 from summer_private.assessment_deleted_ids where id=new.id) then
    raise exception 'Esta avaliação foi removida. Reabra a lista de avaliações.' using errcode='40001';
  end if;
  return new;
end;
$$;
revoke all on function summer_private.block_removed_assessment_recreation() from public,anon,authenticated;

create or replace function summer_private.assessment_purge(p_id uuid,p_removed_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing summer_private.assessment_removals;
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if p_id is null or p_removed_at is null then raise exception 'Selecione uma avaliação da lixeira.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext(p_id::text));
  select * into existing from summer_private.assessment_removals where id=p_id for update;
  if not found or existing.removed_at is distinct from p_removed_at then
    raise exception 'A lixeira mudou. Atualize a lista antes de excluir.' using errcode='40001';
  end if;
  -- Retain only an opaque ID to prevent old drafts from recreating erased records.
  insert into summer_private.assessment_deleted_ids(id) values(p_id) on conflict do nothing;
  delete from summer_private.assessment_removals where id=p_id;
  return jsonb_build_object('deleted',1);
end;
$$;
revoke all on function summer_private.assessment_purge(uuid,timestamptz) from public,anon;
grant execute on function summer_private.assessment_purge(uuid,timestamptz) to authenticated;
create or replace function public.summer_assessment_purge(p_id uuid,p_removed_at timestamptz) returns jsonb
language sql security invoker set search_path='' as $$ select summer_private.assessment_purge(p_id,p_removed_at); $$;
revoke all on function public.summer_assessment_purge(uuid,timestamptz) from public,anon;
grant execute on function public.summer_assessment_purge(uuid,timestamptz) to authenticated;

create or replace function summer_private.assessment_trash(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Página inválida.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'removed_at',removed_at,'can_purge',true,
    'student_name',snapshot->>'student_name','registration',snapshot->>'registration',
    'instructor',snapshot->>'instructor','assessed_on',snapshot->>'assessed_on','status',snapshot->>'status')
    order by removed_at desc,id),'[]') from
    (select * from summer_private.assessment_removals order by removed_at desc,id limit 30 offset p_offset) a);
end;
$$;
revoke all on function summer_private.assessment_trash(integer) from public,anon;
grant execute on function summer_private.assessment_trash(integer) to authenticated;
notify pgrst, 'reload schema';
commit;
