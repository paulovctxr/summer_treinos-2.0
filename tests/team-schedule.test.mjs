import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { addDays, movementSummary, scheduleIssues, weekStart } from '../lib/team-schedule.ts';
import { teamScheduleWorkbook } from '../lib/team-schedule-excel.ts';

test('agenda helpers preserve Brazilian calendar weeks and summarize only supplied counts', () => {
  assert.equal(weekStart('2026-11-17'), '2026-11-16');
  assert.equal(weekStart('2026-11-22'), '2026-11-16');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(movementSummary([
    { counted_on: '2026-11-16', counted_hour: 8, people_count: 12, revision: 1, updated_at: '' },
    { counted_on: '2026-11-16', counted_hour: 9, people_count: 18, revision: 1, updated_at: '' },
    { counted_on: '2026-11-16', counted_hour: 10, people_count: 0, revision: 1, updated_at: '' },
  ]), { total: 30, average: 15, peak: { counted_on: '2026-11-16', counted_hour: 9, people_count: 18, revision: 1, updated_at: '' } });
  assert.deepEqual(scheduleIssues({ id: crypto.randomUUID(), scheduled_on: '2026-11-17', scheduled_time: '08:00', student_id: null, student_name: '', registration: '12', instructor: '', activity: 'assessment', notes: '', status: 'scheduled', revision: 0, updated_at: '' }), [
    'Informe o nome do aluno.', 'A matrícula deve ter quatro números.', 'Informe o professor responsável.',
  ]);
});

test('team Excel keeps agenda and hourly count in printable weekly grids', async () => {
  const entry = { id: crypto.randomUUID(), scheduled_on: '2026-11-17', scheduled_time: '08:30', student_id: null, student_name: 'Aluno Teste', registration: '1234', instructor: 'Professor Teste', activity: 'training_setup', notes: 'Treino B', status: 'attended', revision: 1, updated_at: '' };
  const count = { counted_on: '2026-11-17', counted_hour: 8, people_count: 17, revision: 1, updated_at: '' };
  const book = teamScheduleWorkbook([entry], [count], '2026-11-16');
  assert.deepEqual(book.worksheets.map(sheet => sheet.name), ['Agenda', 'Contagem musculação']);
  assert.equal(book.getWorksheet('Agenda').getCell('C8').value, 'Aluno Teste · 1234\nMontar treino · Professor Teste\nTreino B');
  assert.equal(book.getWorksheet('Contagem musculação').getCell('C7').value, 17);
  assert.match(book.getWorksheet('Agenda').pageSetup.printArea, /^A1:H/);
  const bytes = await book.xlsx.writeBuffer(); assert.ok(bytes.byteLength > 5000);
});

test('team agenda and movement counts are private, validated and concurrency safe', async t => {
  const db = new PGlite(); t.after(() => db.close());
  const admin = '10000000-0000-0000-0000-000000000001';
  const team = '10000000-0000-0000-0000-000000000002';
  const student = '10000000-0000-0000-0000-000000000003';
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$ select true $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    ('${admin}','victorpaulognv@gmail.com',now(),'{}'),('${team}','equipe@example.test',now(),'{}'),
    ('${student}','aluno@example.test',now(),'{"name":"Aluno Teste","matricula":"1234"}');`);
  for (const name of (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort())
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  const asUser = async (user, role = 'authenticated') => db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${user}',false);`);
  const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
  const id = '40000000-0000-0000-0000-000000000001';
  const appointment = { id, scheduled_on: '2026-11-17', scheduled_time: '08:00', student_id: student, student_name: 'Aluno Teste', registration: '1234', instructor: 'Professor Teste', activity: 'assessment', notes: 'Primeira avaliação', status: 'scheduled' };

  await asUser(admin); await scalar('select public.summer_admin_assessment_account($1,true)', [team]);
  await asUser(student);
  await assert.rejects(() => scalar('select public.summer_team_schedule_list($1,$2)', ['2026-11-16', '2026-11-22']), /restrito/);
  await assert.rejects(() => scalar('select public.summer_gym_movement_save($1,$2,$3,$4)', ['2026-11-17', 8, 10, 0]), /restrito/);
  await asUser(team);
  const saved = await scalar('select public.summer_team_schedule_save($1::jsonb,0)', [JSON.stringify(appointment)]);
  assert.equal(saved.revision, 1); assert.equal(saved.student_name, 'Aluno Teste');
  assert.equal((await scalar('select public.summer_team_schedule_list($1,$2)', ['2026-11-16', '2026-11-22'])).length, 1);
  await assert.rejects(() => scalar('select public.summer_team_schedule_save($1::jsonb,0)', [JSON.stringify({ ...appointment, status: 'attended' })]), /mudou/);
  const attended = await scalar('select public.summer_team_schedule_save($1::jsonb,1)', [JSON.stringify({ ...appointment, status: 'attended' })]);
  assert.equal(attended.status, 'attended'); assert.equal(attended.revision, 2);
  await assert.rejects(() => scalar('select public.summer_team_schedule_save($1::jsonb,2)', [JSON.stringify({ ...appointment, activity: 'invalid' })]), /Opção/);
  const movement = await scalar('select public.summer_gym_movement_save($1,$2,$3,$4)', ['2026-11-17', 8, 17, 0]);
  assert.equal(movement.people_count, 17); assert.equal(movement.revision, 1);
  await assert.rejects(() => scalar('select public.summer_gym_movement_save($1,$2,$3,$4)', ['2026-11-17', 8, 18, 0]), /mudou/);
  assert.equal((await scalar('select public.summer_gym_movement_list($1,$2)', ['2026-11-16', '2026-11-22']))[0].people_count, 17);
  await assert.rejects(() => db.query('select * from summer_private.team_schedule_entries'), /permission denied/);
  assert.equal(await scalar('select public.summer_team_schedule_remove($1,$2)', [id, 2]), true);
  assert.deepEqual(await scalar('select public.summer_team_schedule_list($1,$2)', ['2026-11-16', '2026-11-22']), []);
});
