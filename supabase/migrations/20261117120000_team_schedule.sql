-- Responsive replacement for the paper/Excel team agenda and hourly gym count.
begin;

create table if not exists summer_private.team_schedule_entries (
  id uuid primary key,
  scheduled_on date not null,
  scheduled_time time not null,
  student_id uuid references auth.users(id) on delete set null,
  student_name text not null check(length(student_name) between 1 and 120),
  registration text not null default '' check(registration='' or registration~'^[0-9]{4}$'),
  instructor text not null check(length(instructor) between 1 and 120),
  activity text not null check(activity in ('assessment','training_setup','training_guidance','other')),
  notes text not null default '' check(length(notes)<=500),
  status text not null default 'scheduled' check(status in ('scheduled','attended','missed','cancelled')),
  revision integer not null default 1 check(revision>0),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists team_schedule_date_time on summer_private.team_schedule_entries(scheduled_on,scheduled_time,id);

create table if not exists summer_private.gym_movement_counts (
  counted_on date not null,
  counted_hour smallint not null check(counted_hour between 6 and 21),
  people_count smallint not null check(people_count between 0 and 500),
  revision integer not null default 1 check(revision>0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(counted_on,counted_hour)
);

alter table summer_private.team_schedule_entries enable row level security;
alter table summer_private.gym_movement_counts enable row level security;
revoke all on summer_private.team_schedule_entries,summer_private.gym_movement_counts from public,anon,authenticated;

create or replace function summer_private.team_schedule_list(p_start date,p_end date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if p_start is null or p_end is null or p_end<p_start or p_end-p_start>62 then raise exception 'Período inválido.'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(e)-'created_by' order by scheduled_on,scheduled_time,id),'[]')
    from summer_private.team_schedule_entries e where scheduled_on between p_start and p_end);
end;
$$;

create or replace function summer_private.team_schedule_save(p_record jsonb,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous summer_private.team_schedule_entries; saved summer_private.team_schedule_entries;
  record_id uuid:=nullif(p_record->>'id','')::uuid;
  record_date date:=nullif(p_record->>'scheduled_on','')::date;
  record_time time:=nullif(p_record->>'scheduled_time','')::time;
  student uuid:=nullif(p_record->>'student_id','')::uuid;
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if record_id is null or p_revision is null or p_revision<0 or record_date not between '2020-01-01'::date and '2100-12-31'::date then raise exception 'Agendamento inválido.'; end if;
  if record_time is null then raise exception 'Horário inválido.'; end if;
  if coalesce(p_record->>'activity','') not in ('assessment','training_setup','training_guidance','other')
    or coalesce(p_record->>'status','') not in ('scheduled','attended','missed','cancelled') then raise exception 'Opção inválida.'; end if;
  if length(btrim(coalesce(p_record->>'student_name',''))) not between 1 and 120
    or length(btrim(coalesce(p_record->>'instructor',''))) not between 1 and 120
    or length(coalesce(p_record->>'notes',''))>500
    or (coalesce(p_record->>'registration','')<>'' and coalesce(p_record->>'registration','')!~'^[0-9]{4}$') then raise exception 'Confira os dados do agendamento.'; end if;
  if student is not null and not exists(select 1 from public.summer_academy_memberships m join auth.users u on u.id=m.user_id
      where m.user_id=student and m.registration=p_record->>'registration' and u.deleted_at is null and u.email_confirmed_at is not null
      and not exists(select 1 from summer_private.assessment_team t where t.user_id=u.id)) then
    raise exception 'Confira a matrícula e confirme o aluno novamente.';
  end if;
  perform pg_advisory_xact_lock(hashtext(record_id::text));
  select * into previous from summer_private.team_schedule_entries where id=record_id for update;
  if found and previous.revision<>p_revision then raise exception 'O agendamento mudou. Atualize a agenda.' using errcode='40001';
  elsif not found and p_revision<>0 then raise exception 'Agendamento indisponível.' using errcode='40001'; end if;
  insert into summer_private.team_schedule_entries(id,scheduled_on,scheduled_time,student_id,student_name,registration,instructor,activity,notes,status,created_by)
    values(record_id,record_date,record_time,student,btrim(p_record->>'student_name'),coalesce(p_record->>'registration',''),btrim(p_record->>'instructor'),p_record->>'activity',coalesce(p_record->>'notes',''),p_record->>'status',auth.uid())
    on conflict(id) do update set scheduled_on=excluded.scheduled_on,scheduled_time=excluded.scheduled_time,student_id=excluded.student_id,
      student_name=excluded.student_name,registration=excluded.registration,instructor=excluded.instructor,activity=excluded.activity,
      notes=excluded.notes,status=excluded.status,revision=summer_private.team_schedule_entries.revision+1,updated_at=now()
    returning * into saved;
  return to_jsonb(saved)-'created_by';
end;
$$;

create or replace function summer_private.team_schedule_remove(p_id uuid,p_revision integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  delete from summer_private.team_schedule_entries where id=p_id and revision=p_revision;
  if not found then raise exception 'O agendamento mudou. Atualize a agenda.' using errcode='40001'; end if;
  return true;
end;
$$;

create or replace function summer_private.gym_movement_list(p_start date,p_end date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if p_start is null or p_end is null or p_end<p_start or p_end-p_start>62 then raise exception 'Período inválido.'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(c)-'updated_by' order by counted_on,counted_hour),'[]')
    from summer_private.gym_movement_counts c where counted_on between p_start and p_end);
end;
$$;

create or replace function summer_private.gym_movement_save(p_counted_on date,p_counted_hour integer,p_people_count integer,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous summer_private.gym_movement_counts; saved summer_private.gym_movement_counts;
begin
  if not summer_private.can_assess() then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if p_counted_on not between '2020-01-01'::date and '2100-12-31'::date or p_counted_hour not between 6 and 21
    or p_people_count not between 0 and 500 or p_revision is null or p_revision<0 then raise exception 'Contagem inválida.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_counted_on::text||':'||p_counted_hour::text));
  select * into previous from summer_private.gym_movement_counts where counted_on=p_counted_on and counted_hour=p_counted_hour for update;
  if found and previous.revision<>p_revision then raise exception 'A contagem mudou. Atualize a tela.' using errcode='40001';
  elsif not found and p_revision<>0 then raise exception 'Contagem indisponível.' using errcode='40001'; end if;
  insert into summer_private.gym_movement_counts(counted_on,counted_hour,people_count,updated_by)
    values(p_counted_on,p_counted_hour,p_people_count,auth.uid())
    on conflict(counted_on,counted_hour) do update set people_count=excluded.people_count,revision=summer_private.gym_movement_counts.revision+1,updated_by=auth.uid(),updated_at=now()
    returning * into saved;
  return to_jsonb(saved)-'updated_by';
end;
$$;

revoke all on function summer_private.team_schedule_list(date,date),summer_private.team_schedule_save(jsonb,integer),
  summer_private.team_schedule_remove(uuid,integer),summer_private.gym_movement_list(date,date),
  summer_private.gym_movement_save(date,integer,integer,integer) from public,anon;
grant execute on function summer_private.team_schedule_list(date,date),summer_private.team_schedule_save(jsonb,integer),
  summer_private.team_schedule_remove(uuid,integer),summer_private.gym_movement_list(date,date),
  summer_private.gym_movement_save(date,integer,integer,integer) to authenticated;

create or replace function public.summer_team_schedule_list(p_start date,p_end date) returns jsonb
language sql stable security invoker set search_path='' as $$select summer_private.team_schedule_list(p_start,p_end);$$;
create or replace function public.summer_team_schedule_save(p_record jsonb,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$select summer_private.team_schedule_save(p_record,p_revision);$$;
create or replace function public.summer_team_schedule_remove(p_id uuid,p_revision integer) returns boolean
language sql security invoker set search_path='' as $$select summer_private.team_schedule_remove(p_id,p_revision);$$;
create or replace function public.summer_gym_movement_list(p_start date,p_end date) returns jsonb
language sql stable security invoker set search_path='' as $$select summer_private.gym_movement_list(p_start,p_end);$$;
create or replace function public.summer_gym_movement_save(p_counted_on date,p_counted_hour integer,p_people_count integer,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$select summer_private.gym_movement_save(p_counted_on,p_counted_hour,p_people_count,p_revision);$$;

revoke all on function public.summer_team_schedule_list(date,date),public.summer_team_schedule_save(jsonb,integer),
  public.summer_team_schedule_remove(uuid,integer),public.summer_gym_movement_list(date,date),
  public.summer_gym_movement_save(date,integer,integer,integer) from public,anon;
grant execute on function public.summer_team_schedule_list(date,date),public.summer_team_schedule_save(jsonb,integer),
  public.summer_team_schedule_remove(uuid,integer),public.summer_gym_movement_list(date,date),
  public.summer_gym_movement_save(date,integer,integer,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
