import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const admin = '10000000-0000-0000-0000-000000000001';
const alice = '10000000-0000-0000-0000-000000000002';
const bob = '10000000-0000-0000-0000-000000000003';

async function setupDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
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
    .filter(name => name.endsWith('.sql') && name <= '20261101091000_summer_pro_conversion_events.sql')
    .sort();
  for (const migration of migrations) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  return db;
}

test('eventos do funil PRO preservam isolamento e entregam somente agregados', async () => {
  const db = await setupDatabase();
  async function asUser(id, role = 'authenticated') {
    await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${id}', false);`);
  }
  async function scalar(sql) {
    return Object.values((await db.query(sql)).rows[0])[0];
  }

  const publicFunctions = await db.query(`select p.proname, p.prosecdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'summer_log_pro_conversion_event', 'summer_admin_pro_conversion_funnel'
    )`);
  assert.equal(publicFunctions.rows.length, 2);
  assert.ok(publicFunctions.rows.every(item => item.prosecdef === false));
  const columns = await db.query(`select column_name from information_schema.columns
    where table_schema = 'summer_private' and table_name = 'pro_conversion_events'
    order by ordinal_position`);
  assert.deepEqual(columns.rows.map(item => item.column_name), [
    'id', 'user_id', 'event_name', 'source', 'referral_code', 'created_at',
  ]);

  await asUser(alice);
  assert.equal(await scalar("select public.summer_log_pro_conversion_event('offer_viewed','home',null)"), true);
  assert.equal(await scalar("select public.summer_log_pro_conversion_event('offer_viewed','home',null)"), false);
  assert.equal((await scalar('select public.summer_start_pro_trial()')).started, true);
  assert.equal(await scalar("select public.summer_log_pro_conversion_event('checkout_opened','checkout','recepcao')"), true);

  await assert.rejects(
    () => db.query("select public.summer_log_pro_conversion_event('offer_viewed','nome-do-aluno',null)"),
    /Origem invalida/,
  );
  await assert.rejects(
    () => db.query("select public.summer_log_pro_conversion_event('offer_viewed','home','email@aluno.test')"),
    /Indicacao invalida/,
  );
  await assert.rejects(
    () => db.query("select public.summer_log_pro_conversion_event('nome_do_aluno','home',null)"),
    /Evento invalido/,
  );
  await assert.rejects(
    () => db.query(`select summer_private.log_pro_conversion_event('${bob}','offer_viewed','home',null)`),
    /Acesso negado/,
  );
  await assert.rejects(
    () => db.query('select * from summer_private.pro_conversion_events'),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query('select public.summer_admin_pro_conversion_funnel(30)'),
    /restrito/,
  );

  await asUser(bob);
  assert.equal(await scalar("select public.summer_log_pro_conversion_event('offer_viewed','plans',null)"), true);
  assert.equal(await scalar("select public.summer_log_pro_conversion_event('pro_feature_opened','nutrition',null)"), true);

  await asUser(admin);
  await scalar(`select public.summer_admin_set_subscription('${alice}','monthly','grant')`);
  const aggregate = await scalar('select public.summer_admin_pro_conversion_funnel(30)');
  assert.deepEqual(
    {
      offers: aggregate.funnel.offers,
      trials: aggregate.funnel.trials,
      checkouts: aggregate.funnel.checkouts,
      paid: aggregate.funnel.paid,
    },
    { offers: 2, trials: 1, checkouts: 1, paid: 1 },
  );
  assert.equal(Number(aggregate.funnel.offer_to_trial_rate), 50);
  assert.equal(Number(aggregate.funnel.trial_to_checkout_rate), 100);
  assert.equal(Number(aggregate.funnel.checkout_to_paid_rate), 100);
  assert.equal(aggregate.events.offer_views, 2);
  assert.equal(aggregate.events.unique_users, 2);
  assert.equal(aggregate.events.pro_feature_users, 1);
  const serialized = JSON.stringify(aggregate);
  assert.doesNotMatch(serialized, /alice@example|bob@example|10000000-/);

  await asUser('', 'anon');
  await assert.rejects(
    () => db.query("select public.summer_log_pro_conversion_event('offer_viewed','home',null)"),
    /permission denied/,
  );

  await db.close();
});
