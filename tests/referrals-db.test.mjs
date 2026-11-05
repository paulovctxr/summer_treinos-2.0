import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const admin = '10000000-0000-0000-0000-000000000001';
const alice = '10000000-0000-0000-0000-000000000002';
const bob = '10000000-0000-0000-0000-000000000003';
const newcomer = '10000000-0000-0000-0000-000000000004';

test('referral codes are private, immutable per account and aggregate-only for admins', async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create schema storage;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$ select true $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
      ('${admin}','victorpaulognv@gmail.com',now(),'{}'),
      ('${alice}','alice@example.test',now(),'{}'),
      ('${bob}','bob@example.test',now(),'{}');`);

  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
    .filter(name => name.endsWith('.sql'))
    .sort();
  for (const migration of migrations)
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));

  async function asUser(id, role = 'authenticated') {
    await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${id}', false);`);
  }
  async function scalar(sql) {
    return Object.values((await db.query(sql)).rows[0])[0];
  }

  await asUser('', 'anon');
  assert.deepEqual(await scalar(`select public.summer_public_referral('recepcao')`), {
    valid: true,
    code: 'recepcao',
    label: 'Recepção da academia',
  });
  assert.deepEqual(await scalar(`select public.summer_public_referral('../admin')`), { valid: false });
  await assert.rejects(() => db.query('select * from summer_private.referral_codes'), /permission denied/);

  await asUser(alice);
  const first = await scalar(`select public.summer_attach_referral('recepcao')`);
  assert.equal(first.attached, true);
  assert.equal(first.code, 'recepcao');
  const second = await scalar(`select public.summer_attach_referral('avaliacao')`);
  assert.equal(second.attached, false);
  assert.equal(second.already_attributed, true);
  assert.equal(second.code, 'recepcao');
  await assert.rejects(
    () => db.query(`select public.summer_admin_set_referral('cartaz', 'Cartaz da academia', true)`),
    /restrito/,
  );
  await assert.rejects(() => db.query('select public.summer_admin_referral_summary()'), /restrito/);

  await asUser(admin);
  const created = await scalar(`select public.summer_admin_set_referral('CARTAZ-01', 'Cartaz do vestiário', true)`);
  assert.equal(created.code, 'cartaz-01');
  await db.exec(`reset role; insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    values ('${newcomer}','new@example.test',now(),'{"referral_code":"avaliacao"}'::jsonb)`);
  await asUser(admin);
  const summary = await scalar('select public.summer_admin_referral_summary()');
  assert.equal(summary.codes.find(item => item.code === 'recepcao').referred_accounts, 1);
  assert.equal(summary.codes.find(item => item.code === 'avaliacao').referred_accounts, 1);
  assert.equal(summary.codes.find(item => item.code === 'cartaz-01').referred_accounts, 0);
  assert.doesNotMatch(JSON.stringify(summary), /alice@example|new@example|10000000-0000/);

  await db.close();
});
