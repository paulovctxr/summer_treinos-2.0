-- Team workspace: student assessment notices, recoverable trash, teacher workout prescriptions.
begin;
alter table summer_private.assessments add column if not exists viewed_at timestamptz;

create or replace function summer_private.assessment_notice() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  return (select jsonb_build_object('unread',count(*) filter(where viewed_at is null),'total',count(*))
    from summer_private.assessments where student_id=auth.uid() and status='published');
end;
$$;
create or replace function summer_private.assessment_seen(p_id uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare seen timestamptz;
begin
  update summer_private.assessments set viewed_at=coalesce(viewed_at,now())
    where id=p_id and student_id=auth.uid() and status='published' returning viewed_at into seen;
  if not found then raise exception 'Avaliação indisponível.' using errcode='42501'; end if;
  return seen;
end;
$$;

create or replace function summer_private.assessment_trash(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Página inválida.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'removed_at',removed_at,
    'student_name',snapshot->>'student_name','registration',snapshot->>'registration',
    'instructor',snapshot->>'instructor','assessed_on',snapshot->>'assessed_on','status',snapshot->>'status')
    order by removed_at desc,id),'[]') from
    (select * from summer_private.assessment_removals order by removed_at desc,id limit 30 offset p_offset) a);
end;
$$;

create or replace function summer_private.assessment_restore(p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; removed summer_private.assessment_removals; restored summer_private.assessments; count_restored integer:=0;
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Seleção inválida.'; end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100000 or
     (select count(distinct x->>'id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then
    raise exception 'Selecione as avaliações que deseja recuperar.';
  end if;
  for item in select x from jsonb_array_elements(p_items) x order by x->>'id' loop
    perform pg_advisory_xact_lock(hashtext(item->>'id'));
    select * into removed from summer_private.assessment_removals where id=(item->>'id')::uuid for update;
    if not found or removed.removed_at is distinct from (item->>'removed_at')::timestamptz then
      raise exception 'A lixeira mudou. Atualize a lista antes de recuperar.' using errcode='40001';
    end if;
    restored:=jsonb_populate_record(null::summer_private.assessments,removed.snapshot);
    if restored.student_id is not null and not exists(select 1 from auth.users where id=restored.student_id and deleted_at is null) then
      raise exception 'O cadastro deste aluno não está mais disponível. Consulte a administração.';
    end if;
    if restored.created_by is not null and not exists(select 1 from auth.users where id=restored.created_by) then restored.created_by:=null; end if;
    restored.revision:=restored.revision+1; restored.updated_at:=now();
    -- Delete inside the same transaction so the recreation guard permits the recovery.
    delete from summer_private.assessment_removals where id=removed.id;
    insert into summer_private.assessments select (restored).*;
    count_restored:=count_restored+1;
  end loop;
  return jsonb_build_object('restored',count_restored);
end;
$$;

create table if not exists summer_private.training_plans (
  id uuid primary key,
  student_id uuid references auth.users(id) on delete set null,
  student_name text not null default '' check(length(student_name)<=120),
  registration text not null default '' check(registration='' or registration~'^[0-9]{4}$'),
  instructor text not null default '' check(length(instructor)<=120),
  title text not null default '' check(length(title)<=80),
  objective text not null default '' check(length(objective)<=200),
  target_zone text not null default '' check(length(target_zone)<=100),
  starts_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  reviewed_on date,
  reassess_on date,
  source_assessment_id uuid,
  notes text not null default '' check(length(notes)<=2000),
  workouts jsonb not null default '[]' check(jsonb_typeof(workouts)='array' and octet_length(workouts::text)<=100000),
  status text not null default 'draft' check(status in ('draft','published')),
  revision integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
alter table summer_private.training_plans enable row level security;
alter table summer_private.training_plans add column if not exists objective text not null default '' check(length(objective)<=200);
alter table summer_private.training_plans add column if not exists target_zone text not null default '' check(length(target_zone)<=100);
alter table summer_private.training_plans add column if not exists starts_on date not null default (now() at time zone 'America/Sao_Paulo')::date;
alter table summer_private.training_plans add column if not exists reviewed_on date;
alter table summer_private.training_plans add column if not exists reassess_on date;
revoke all on summer_private.training_plans from public,anon,authenticated;
create index if not exists training_student_published on summer_private.training_plans(student_id,published_at desc) where status='published';

create or replace function summer_private.training_list(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Página inválida.'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(a)-'created_by'-'workouts'-'notes' order by updated_at desc,id),'[]') from (
    select * from summer_private.training_plans where summer_private.can_assess() or (student_id=auth.uid() and status='published')
    order by updated_at desc,id limit 30 offset p_offset
  ) a);
end;
$$;
create or replace function summer_private.training_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  select to_jsonb(a)-'created_by' into result from summer_private.training_plans a where id=p_id
    and (summer_private.can_assess() or (student_id=auth.uid() and status='published'));
  if result is null then raise exception 'Treino indisponível.' using errcode='42501'; end if;
  return result;
end;
$$;

create or replace function summer_private.training_save(p_record jsonb,p_revision integer,p_publish boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous summer_private.training_plans; saved summer_private.training_plans;
  record_id uuid:=(p_record->>'id')::uuid; student uuid:=nullif(p_record->>'student_id','')::uuid;
  source_id uuid:=nullif(p_record->>'source_assessment_id','')::uuid;
  start_date date:=coalesce(nullif(p_record->>'starts_on','')::date,(now() at time zone 'America/Sao_Paulo')::date);
  review_date date:=nullif(p_record->>'reviewed_on','')::date;
  reassess_date date:=nullif(p_record->>'reassess_on','')::date;
  blocks jsonb:=p_record->'workouts'; w jsonb; e jsonb; valid_student boolean; all_ids text[]:='{}';
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if record_id is null or p_revision is null or p_revision<0 or p_publish is null then raise exception 'Treino inválido.'; end if;
  if start_date not between '1900-01-01'::date and '2100-12-31'::date or review_date not between '1900-01-01'::date and '2100-12-31'::date or reassess_date not between start_date and '2100-12-31'::date then raise exception 'Confira as datas da ficha e da reavaliação.'; end if;
  if jsonb_typeof(blocks) is distinct from 'array' or octet_length(blocks::text)>100000 then raise exception 'Ficha inválida.'; end if;
  if jsonb_array_length(blocks)>12 or (p_publish and jsonb_array_length(blocks)=0) then raise exception 'Inclua de 1 a 12 treinos.'; end if;
  select exists(select 1 from public.summer_academy_memberships m join auth.users u on u.id=m.user_id
    where m.user_id=student and m.registration=p_record->>'registration' and u.deleted_at is null and u.email_confirmed_at is not null
      and not exists(select 1 from summer_private.assessment_team t where t.user_id=u.id)) into valid_student;
  if student is not null and not valid_student then raise exception 'Confira a matrícula e confirme o aluno novamente.'; end if;
  if source_id is not null and not exists(select 1 from summer_private.assessments where id=source_id and student_id=student and status='published') then
    raise exception 'A avaliação de referência está indisponível ou pertence a outro aluno. Confira o vínculo.';
  end if;
  if p_publish and (not valid_student or btrim(coalesce(p_record->>'title',''))='' or btrim(coalesce(p_record->>'instructor',''))='' or btrim(coalesce(p_record->>'student_name',''))='') then
    raise exception 'Confirme o aluno e preencha o título e o professor antes de publicar.';
  end if;
  for w in select value from jsonb_array_elements(blocks) loop
    if jsonb_typeof(w) is distinct from 'object' or jsonb_typeof(w->'id') is distinct from 'string' or length(w->>'id') not between 1 and 80
      or (w->>'id')=any(all_ids) or jsonb_typeof(w->'title') is distinct from 'string' or length(w->>'title')>80
      or jsonb_typeof(w->'focus') is distinct from 'string' or length(w->>'focus')>100
      or jsonb_typeof(w->'minutes') is distinct from 'number' or (w->>'minutes') !~ '^[0-9]+$' then raise exception 'Treino inválido.'; end if;
    if (w->>'minutes')::integer not between 1 and 240 then raise exception 'Confira a duração do treino.'; end if;
    all_ids:=array_append(all_ids,w->>'id');
    if jsonb_typeof(w->'exercises') is distinct from 'array' then raise exception 'Exercícios inválidos.'; end if;
    if jsonb_array_length(w->'exercises')>20 or (p_publish and (btrim(w->>'title')='' or jsonb_array_length(w->'exercises')=0)) then raise exception 'Cada treino precisa de título e de 1 a 20 exercícios.'; end if;
    for e in select value from jsonb_array_elements(w->'exercises') loop
      if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string' or length(e->>'id') not between 1 and 80
        or (e->>'id')=any(all_ids) or jsonb_typeof(e->'name') is distinct from 'string' or length(e->>'name')>80
        or jsonb_typeof(e->'sets') is distinct from 'number' or (e->>'sets') !~ '^[0-9]+$'
        or jsonb_typeof(e->'reps') is distinct from 'string' or length(e->>'reps')>40 then raise exception 'Exercício inválido.'; end if;
      all_ids:=array_append(all_ids,e->>'id');
      if (e->>'sets')::integer not between 0 and 20 or (p_publish and ((e->>'sets')::integer=0 or btrim(e->>'name')='' or btrim(e->>'reps')='')) then raise exception 'Preencha nome, séries e repetições de todos os exercícios.'; end if;
      if e ? 'restSeconds' then
        if jsonb_typeof(e->'restSeconds') is distinct from 'number' or (e->>'restSeconds') !~ '^[0-9]+$' then raise exception 'Descanso inválido.'; end if;
        if (e->>'restSeconds')::integer not between 0 and 3600 then raise exception 'Descanso inválido.'; end if;
      end if;
      if e ? 'weight' then
        if jsonb_typeof(e->'weight') is distinct from 'number' then raise exception 'Carga inválida.'; end if;
        if (e->>'weight')::numeric not between 0 and 2000 then raise exception 'Carga inválida.'; end if;
      end if;
      if e ? 'weightUnit' and (e->>'weightUnit' is null or e->>'weightUnit' not in ('kg','lb')) then raise exception 'Unidade inválida.'; end if;
      if e ? 'notes' and (jsonb_typeof(e->'notes') is distinct from 'string' or length(e->>'notes')>240) then raise exception 'Observação inválida.'; end if;
    end loop;
  end loop;
  perform pg_advisory_xact_lock(hashtext(record_id::text));
  select * into previous from summer_private.training_plans where id=record_id for update;
  if found then
    if previous.status='published' then raise exception 'Treino publicado é preservado. Crie uma nova versão.'; end if;
    if previous.revision<>p_revision then raise exception 'O rascunho mudou. Reabra a lista antes de continuar.' using errcode='40001'; end if;
  elsif p_revision<>0 then raise exception 'Rascunho indisponível.' using errcode='40001';
  end if;
  insert into summer_private.training_plans(id,student_id,student_name,registration,instructor,title,objective,target_zone,starts_on,reviewed_on,reassess_on,source_assessment_id,notes,workouts,status,created_by,published_at)
    values(record_id,student,btrim(coalesce(p_record->>'student_name','')),coalesce(p_record->>'registration',''),btrim(coalesce(p_record->>'instructor','')),
      btrim(coalesce(p_record->>'title','')),coalesce(p_record->>'objective',''),coalesce(p_record->>'target_zone',''),start_date,review_date,reassess_date,source_id,coalesce(p_record->>'notes',''),blocks,case when p_publish then 'published' else 'draft' end,auth.uid(),case when p_publish then now() end)
    on conflict(id) do update set student_id=excluded.student_id,student_name=excluded.student_name,registration=excluded.registration,instructor=excluded.instructor,
      title=excluded.title,objective=excluded.objective,target_zone=excluded.target_zone,starts_on=excluded.starts_on,reviewed_on=excluded.reviewed_on,reassess_on=excluded.reassess_on,source_assessment_id=excluded.source_assessment_id,notes=excluded.notes,workouts=excluded.workouts,status=excluded.status,
      revision=summer_private.training_plans.revision+1,updated_at=now(),published_at=excluded.published_at returning * into saved;
  return to_jsonb(saved)-'created_by';
end;
$$;

revoke all on function summer_private.assessment_notice() from public,anon;
grant execute on function summer_private.assessment_notice() to authenticated;
create or replace function public.summer_assessment_notice() returns jsonb
language sql stable security invoker set search_path='' as $$ select summer_private.assessment_notice(); $$;
revoke all on function public.summer_assessment_notice() from public,anon;
grant execute on function public.summer_assessment_notice() to authenticated;

revoke all on function summer_private.assessment_seen(uuid) from public,anon;
grant execute on function summer_private.assessment_seen(uuid) to authenticated;
create or replace function public.summer_assessment_seen(p_id uuid) returns timestamptz
language sql security invoker set search_path='' as $$ select summer_private.assessment_seen(p_id); $$;
revoke all on function public.summer_assessment_seen(uuid) from public,anon;
grant execute on function public.summer_assessment_seen(uuid) to authenticated;

revoke all on function summer_private.assessment_trash(integer) from public,anon;
grant execute on function summer_private.assessment_trash(integer) to authenticated;
create or replace function public.summer_assessment_trash(p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$ select summer_private.assessment_trash(p_offset); $$;
revoke all on function public.summer_assessment_trash(integer) from public,anon;
grant execute on function public.summer_assessment_trash(integer) to authenticated;

revoke all on function summer_private.assessment_restore(jsonb) from public,anon;
grant execute on function summer_private.assessment_restore(jsonb) to authenticated;
create or replace function public.summer_assessment_restore(p_items jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select summer_private.assessment_restore(p_items); $$;
revoke all on function public.summer_assessment_restore(jsonb) from public,anon;
grant execute on function public.summer_assessment_restore(jsonb) to authenticated;

revoke all on function summer_private.training_list(integer) from public,anon;
grant execute on function summer_private.training_list(integer) to authenticated;
create or replace function public.summer_training_list(p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$ select summer_private.training_list(p_offset); $$;
revoke all on function public.summer_training_list(integer) from public,anon;
grant execute on function public.summer_training_list(integer) to authenticated;

revoke all on function summer_private.training_get(uuid) from public,anon;
grant execute on function summer_private.training_get(uuid) to authenticated;
create or replace function public.summer_training_get(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select summer_private.training_get(p_id); $$;
revoke all on function public.summer_training_get(uuid) from public,anon;
grant execute on function public.summer_training_get(uuid) to authenticated;

revoke all on function summer_private.training_save(jsonb,integer,boolean) from public,anon;
grant execute on function summer_private.training_save(jsonb,integer,boolean) to authenticated;
create or replace function public.summer_training_save(p_record jsonb,p_revision integer,p_publish boolean default false) returns jsonb
language sql security invoker set search_path='' as $$ select summer_private.training_save(p_record,p_revision,p_publish); $$;
revoke all on function public.summer_training_save(jsonb,integer,boolean) from public,anon;
grant execute on function public.summer_training_save(jsonb,integer,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
