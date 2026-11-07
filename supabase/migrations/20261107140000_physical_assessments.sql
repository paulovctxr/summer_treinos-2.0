-- Shared assessment team: one restricted account, private drafts, published copies for students.
begin;

create table if not exists summer_private.assessment_team (
  singleton boolean primary key default true check (singleton),
  user_id uuid unique references auth.users(id) on delete set null
);
insert into summer_private.assessment_team(singleton) values(true) on conflict do nothing;
create table if not exists summer_private.assessments (
  id uuid primary key,
  student_id uuid references auth.users(id) on delete set null,
  student_name text not null default '' check(length(student_name)<=120),
  registration text not null default '' check(registration='' or registration ~ '^[0-9]{4}$'),
  instructor text not null default '' check(length(instructor)<=120),
  assessed_on date not null,
  reassess_on date,
  model text not null check(model in ('HOMENS','MULHERES')),
  data jsonb not null default '{}' check(jsonb_typeof(data)='object' and octet_length(data::text)<=100000),
  status text not null default 'draft' check(status in ('draft','published')),
  revision integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists assessments_student_date on summer_private.assessments(student_id,assessed_on desc) where status='published';
alter table summer_private.assessment_team enable row level security;
alter table summer_private.assessments enable row level security;
revoke all on summer_private.assessment_team, summer_private.assessments from public, anon, authenticated;

create or replace function summer_private.summer_is_assessment_team() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from summer_private.assessment_team t join auth.users u on u.id=t.user_id
    where t.user_id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null);
$$;
revoke all on function summer_private.summer_is_assessment_team() from public,anon;
grant execute on function summer_private.summer_is_assessment_team() to authenticated;
create or replace function public.summer_is_assessment_team() returns boolean
language sql stable security invoker set search_path='' as $$
  select summer_private.summer_is_assessment_team();
$$;
create or replace function summer_private.can_assess() returns boolean
language sql stable security definer set search_path='' as $$
  select summer_private.is_admin() or public.summer_is_assessment_team();
$$;

create or replace function summer_private.summer_admin_assessment_account(p_user_id uuid default null, p_change boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_id uuid; result jsonb;
begin
  if not summer_private.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  select user_id into current_id from summer_private.assessment_team where singleton for update;
  if p_change then
    if p_user_id is not null then
      if current_id is not null and current_id<>p_user_id then raise exception 'Desative a conta atual antes de substituí-la.'; end if;
      if not exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null and u.deleted_at is null)
         or exists(select 1 from auth.users u join summer_private.admin_emails a on lower(u.email)=a.email where u.id=p_user_id)
         or exists(select 1 from public.summer_academy_memberships m where m.user_id=p_user_id and m.registration is not null) then
        raise exception 'Utilize uma conta exclusiva para avaliações, sem matrícula de aluno.';
      end if;
      -- The shared account has no student access and no administrative permissions.
      update public.summer_academy_memberships set status='inactive',updated_at=now() where user_id=p_user_id;
    end if;
    update summer_private.assessment_team set user_id=p_user_id where singleton;
  end if;
  select jsonb_build_object('user_id',t.user_id,'email',u.email) into result
    from summer_private.assessment_team t left join auth.users u on u.id=t.user_id where singleton;
  return result;
end;
$$;
revoke all on function summer_private.summer_admin_assessment_account(uuid,boolean) from public,anon;
grant execute on function summer_private.summer_admin_assessment_account(uuid,boolean) to authenticated;
create or replace function public.summer_admin_assessment_account(p_user_id uuid default null, p_change boolean default false) returns jsonb
language sql security invoker set search_path='' as $$
  select summer_private.summer_admin_assessment_account(p_user_id,p_change);
$$;

create or replace function summer_private.summer_assessment_find_student(p_registration text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe de avaliações.'; end if;
  if p_registration !~ '^[0-9]{4}$' then raise exception 'Informe quatro números.'; end if;
  select jsonb_build_object('id',u.id,'name',coalesce(nullif(u.raw_user_meta_data->>'name',''),'Aluno'),'registration',m.registration)
    into result from public.summer_academy_memberships m join auth.users u on u.id=m.user_id
    where m.registration=p_registration and u.deleted_at is null and u.email_confirmed_at is not null
    and not exists(select 1 from summer_private.assessment_team t where t.user_id=u.id);
  return result;
end;
$$;
revoke all on function summer_private.summer_assessment_find_student(text) from public,anon;
grant execute on function summer_private.summer_assessment_find_student(text) to authenticated;
create or replace function public.summer_assessment_find_student(p_registration text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select summer_private.summer_assessment_find_student(p_registration);
$$;

create or replace function summer_private.summer_assessment_list(p_offset integer default 0, p_search text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; staff boolean:=summer_private.can_assess();
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_offset<0 or p_offset>100000 or length(p_search)>120 then raise exception 'Filtro inválido.'; end if;
  select coalesce(jsonb_agg(to_jsonb(a)-'data'-'created_by' order by a.assessed_on desc,a.updated_at desc),'[]') into result from (
    select * from summer_private.assessments a where
    (staff or (a.student_id=auth.uid() and a.status='published'))
    and (p_search='' or position(lower(p_search) in lower(a.student_name))>0 or position(p_search in a.registration)>0)
    order by a.assessed_on desc,a.updated_at desc limit 30 offset p_offset
  ) a;
  return result;
end;
$$;
revoke all on function summer_private.summer_assessment_list(integer,text) from public,anon;
grant execute on function summer_private.summer_assessment_list(integer,text) to authenticated;
create or replace function public.summer_assessment_list(p_offset integer default 0, p_search text default '') returns jsonb
language sql stable security invoker set search_path='' as $$
  select summer_private.summer_assessment_list(p_offset,p_search);
$$;

create or replace function summer_private.summer_assessment_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select to_jsonb(a)-'created_by' into result from summer_private.assessments a where a.id=p_id
    and (summer_private.can_assess() or (a.student_id=auth.uid() and a.status='published'));
  if result is null then raise exception 'Avaliação indisponível.'; end if;
  return result;
end;
$$;
revoke all on function summer_private.summer_assessment_get(uuid) from public,anon;
grant execute on function summer_private.summer_assessment_get(uuid) to authenticated;
create or replace function public.summer_assessment_get(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select summer_private.summer_assessment_get(p_id);
$$;

create or replace function summer_private.summer_assessment_save(p_record jsonb, p_revision integer, p_publish boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  previous summer_private.assessments; saved summer_private.assessments;
  record_id uuid:=(p_record->>'id')::uuid;
  student uuid:=nullif(p_record->>'student_id','')::uuid;
  assessment_date date:=(p_record->>'assessed_on')::date;
  reassessment_date date:=nullif(p_record->>'reassess_on','')::date;
  values_json jsonb:=coalesce(p_record->'data','{}');
  rules constant jsonb:='{"birth_date":{"type":"date"},"injuries":{"type":"text"},"medication":{"type":"text"},"smoking":{"type":"text"},"sleep":{"type":"number","min":0,"max":24},"work_routine":{"type":"text"},"diet":{"type":"text"},"activity_history":{"type":"text"},"inactive_time":{"type":"text"},"goals":{"type":"text"},"frequency":{"type":"text"},"weight":{"type":"number","min":15,"max":400},"height":{"type":"number","min":50,"max":250},"skinfold_chest":{"type":"number","min":1,"max":100},"skinfold_abdomen":{"type":"number","min":1,"max":100},"skinfold_thigh":{"type":"number","min":1,"max":100},"skinfold_triceps":{"type":"number","min":1,"max":100},"skinfold_suprailiac":{"type":"number","min":1,"max":100},"body_protocol":{"type":"text"},"body_fat":{"type":"number","min":1,"max":75},"target_fat":{"type":"number","min":1,"max":75},"fat_mass":{"type":"number","min":0,"max":300},"lean_mass":{"type":"number","min":1,"max":250},"target_weight":{"type":"number","min":15,"max":400},"chest":{"type":"number","min":10,"max":250},"abdomen":{"type":"number","min":10,"max":250},"hip":{"type":"number","min":10,"max":250},"arm_right":{"type":"number","min":5,"max":150},"arm_left":{"type":"number","min":5,"max":150},"forearm_right":{"type":"number","min":5,"max":150},"forearm_left":{"type":"number","min":5,"max":150},"upper_thigh_right":{"type":"number","min":5,"max":150},"upper_thigh_left":{"type":"number","min":5,"max":150},"mid_thigh_right":{"type":"number","min":5,"max":150},"mid_thigh_left":{"type":"number","min":5,"max":150},"lower_thigh_right":{"type":"number","min":5,"max":150},"lower_thigh_left":{"type":"number","min":5,"max":150},"calf_right":{"type":"number","min":5,"max":150},"calf_left":{"type":"number","min":5,"max":150},"posture_front":{"type":"text"},"posture_side":{"type":"text"},"posture_back":{"type":"text"},"posture_notes":{"type":"text"},"systolic":{"type":"number","min":50,"max":260},"diastolic":{"type":"number","min":30,"max":180},"resting_hr":{"type":"number","min":25,"max":240},"aerobic_protocol":{"type":"text"},"penultimate_hr":{"type":"number","min":25,"max":240},"last_hr":{"type":"number","min":25,"max":240},"post_systolic":{"type":"number","min":50,"max":260},"post_diastolic":{"type":"number","min":30,"max":180},"load_watts":{"type":"number","min":1,"max":1000},"effort":{"type":"number","min":6,"max":20},"vo2":{"type":"number","min":1,"max":120},"aerobic_guidance":{"type":"text"},"training":{"type":"text"},"notes":{"type":"text"}}';
  field record; rule jsonb; n numeric; valid_student boolean;
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe de avaliações.'; end if;
  if record_id is null or p_revision is null or p_publish is null or p_revision<0 then raise exception 'Avaliação inválida.'; end if;
  if jsonb_typeof(values_json)<>'object' or octet_length(values_json::text)>100000 then raise exception 'Dados inválidos.'; end if;
  if assessment_date is null or assessment_date>(now() at time zone 'America/Sao_Paulo')::date or assessment_date<'1900-01-01'::date
     or reassessment_date<assessment_date then raise exception 'Confira as datas da avaliação.'; end if;
  for field in select key,value from jsonb_each(values_json) loop
    rule:=rules->field.key;
    if rule is null or jsonb_typeof(field.value)<>'string' or length(field.value#>>'{}')>2000 then raise exception 'Campo inválido: %',field.key; end if;
    if btrim(field.value#>>'{}')='' then continue; end if;
    if rule->>'type'='number' then
      if (field.value#>>'{}') !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Valor numérico inválido: %',field.key; end if;
      n:=(field.value#>>'{}')::numeric;
      if n<(rule->>'min')::numeric or n>(rule->>'max')::numeric then raise exception 'Valor fora da faixa: %',field.key; end if;
    elsif rule->>'type'='date' then
      if (field.value#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (field.value#>>'{}')::date>assessment_date or (field.value#>>'{}')::date<'1900-01-01'::date then raise exception 'Data inválida.'; end if;
    end if;
  end loop;
  select exists(select 1 from public.summer_academy_memberships m join auth.users u on u.id=m.user_id
     where m.user_id=student and m.registration=p_record->>'registration' and u.deleted_at is null and u.email_confirmed_at is not null
     and not exists(select 1 from summer_private.assessment_team t where t.user_id=u.id)) into valid_student;
  if student is not null and not valid_student then raise exception 'Confira a matrícula e confirme o aluno novamente.'; end if;
  if p_publish and (not valid_student or length(btrim(coalesce(p_record->>'instructor','')))=0
     or length(btrim(coalesce(p_record->>'student_name','')))=0
     or not exists(select 1 from jsonb_each_text(values_json) where btrim(value)<>'')) then
    raise exception 'Confirme o aluno, o professor e preencha a avaliação antes de publicar.';
  end if;
  -- Serialize first saves as well as later edits from different computers.
  perform pg_advisory_xact_lock(hashtext(record_id::text));
  select * into previous from summer_private.assessments where id=record_id for update;
  if found then
    if previous.status='published' then raise exception 'Avaliação publicada é preservada. Crie uma nova avaliação.'; end if;
    if previous.revision<>p_revision then raise exception 'Outra pessoa alterou este rascunho. Reabra a avaliação antes de continuar.'; end if;
  elsif p_revision<>0 then raise exception 'Rascunho não encontrado.';
  end if;
  insert into summer_private.assessments(id,student_id,student_name,registration,instructor,assessed_on,reassess_on,model,data,status,revision,created_by,published_at)
    values(record_id,student,trim(coalesce(p_record->>'student_name','')),coalesce(p_record->>'registration',''),trim(coalesce(p_record->>'instructor','')),
      assessment_date,reassessment_date,p_record->>'model',values_json,case when p_publish then 'published' else 'draft' end,
      1,auth.uid(),case when p_publish then now() end)
    on conflict(id) do update set student_id=excluded.student_id,student_name=excluded.student_name,registration=excluded.registration,
      instructor=excluded.instructor,assessed_on=excluded.assessed_on,reassess_on=excluded.reassess_on,model=excluded.model,data=excluded.data,
      status=excluded.status,revision=summer_private.assessments.revision+1,updated_at=now(),published_at=excluded.published_at
    returning * into saved;
  return to_jsonb(saved)-'created_by';
end;
$$;
revoke all on function summer_private.summer_assessment_save(jsonb,integer,boolean) from public,anon;
grant execute on function summer_private.summer_assessment_save(jsonb,integer,boolean) to authenticated;
create or replace function public.summer_assessment_save(p_record jsonb, p_revision integer, p_publish boolean default false) returns jsonb
language sql security invoker set search_path='' as $$
  select summer_private.summer_assessment_save(p_record,p_revision,p_publish);
$$;

create or replace function summer_private.summer_assessment_evolution(p_student_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; target uuid:=coalesce(p_student_id,auth.uid());
begin
  if auth.uid() is null or (target<>auth.uid() and not summer_private.can_assess()) then raise exception 'Acesso restrito.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('date',a.assessed_on,'weight',a.data->>'weight','body_fat',a.data->>'body_fat','abdomen',a.data->>'abdomen') order by a.assessed_on,a.published_at),'[]') into result
    from (select assessed_on,published_at,data from summer_private.assessments where student_id=target and status='published' order by assessed_on desc,published_at desc limit 24) a;
  return result;
end;
$$;
revoke all on function summer_private.summer_assessment_evolution(uuid) from public,anon;
grant execute on function summer_private.summer_assessment_evolution(uuid) to authenticated;
create or replace function public.summer_assessment_evolution(p_student_id uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
  select summer_private.summer_assessment_evolution(p_student_id);
$$;
revoke all on function public.summer_assessment_evolution(uuid) from public,anon;
grant execute on function public.summer_assessment_evolution(uuid) to authenticated;

revoke all on function summer_private.can_assess() from public,anon;
grant execute on function summer_private.can_assess() to authenticated;
revoke all on function public.summer_is_assessment_team(),public.summer_admin_assessment_account(uuid,boolean),
 public.summer_assessment_find_student(text),public.summer_assessment_list(integer,text),
 public.summer_assessment_get(uuid),public.summer_assessment_save(jsonb,integer,boolean) from public,anon;
grant execute on function public.summer_is_assessment_team(),public.summer_admin_assessment_account(uuid,boolean),
 public.summer_assessment_find_student(text),public.summer_assessment_list(integer,text),
 public.summer_assessment_get(uuid),public.summer_assessment_save(jsonb,integer,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;

