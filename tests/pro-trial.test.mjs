import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const admin = '10000000-0000-0000-0000-000000000001'
const trialMember = '10000000-0000-0000-0000-000000000002'
const paidMember = '10000000-0000-0000-0000-000000000003'
const unconfirmed = '10000000-0000-0000-0000-000000000004'
const suspended = '10000000-0000-0000-0000-000000000005'

test('Summer PRO trial is server-enforced, single-use and separate from subscriptions', async t => {
  const db = new PGlite()
  t.after(() => db.close())

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
      ('${trialMember}','trial@example.test',now(),'{}'),
      ('${paidMember}','paid@example.test',now(),'{}'),
      ('${unconfirmed}','pending@example.test',null,'{}'),
      ('${suspended}','suspended@example.test',now(),'{}');`)

  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
    .filter(name => name.endsWith('.sql'))
    .sort()
  for (const migration of migrations)
    if (migration < '20261031120000')
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'))
  // Exercise the exact one-transaction script supplied for the SQL Editor.
  await db.exec(await readFile(new URL('../docs/summer-pro-ativacao.sql', import.meta.url), 'utf8'))

  async function asUser(id, role = 'authenticated') {
    await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${id}', false);`)
  }
  async function asDatabaseOwner() {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);")
  }
  async function scalar(sql) {
    return Object.values((await db.query(sql)).rows[0])[0]
  }

  await t.test('only active members with confirmed e-mail can consume a trial', async () => {
    await asUser('', 'anon')
    await assert.rejects(
      () => db.query('select public.summer_start_pro_trial()'),
      /permission denied/,
    )

    await asUser(unconfirmed)
    const pendingAccess = await scalar('select public.summer_get_access()')
    assert.equal(pendingAccess.trial_available, false)
    await assert.rejects(
      () => db.query('select public.summer_start_pro_trial()'),
      /suspenso|inativa|confirmado/i,
    )

    await asUser(admin)
    await scalar(`select public.summer_admin_set_membership('${suspended}', 'suspend', null)`)
    await asUser(suspended)
    await assert.rejects(
      () => db.query('select public.summer_start_pro_trial()'),
      /suspenso|inativa/i,
    )

    await asDatabaseOwner()
    assert.equal(
      Number(await scalar('select count(*) from summer_private.pro_trials')),
      0,
    )
  })

  await t.test('admin and paid access do not consume the one trial', async () => {
    await asUser(admin)
    let result = await scalar('select public.summer_start_pro_trial()')
    assert.equal(result.started, false)
    assert.equal(result.reason, 'already_pro')
    await scalar(`select public.summer_admin_set_subscription('${paidMember}', 'monthly')`)

    await asUser(paidMember)
    assert.equal(await scalar('select public.summer_has_paid_access()'), true)
    result = await scalar('select public.summer_start_pro_trial()')
    assert.equal(result.started, false)
    assert.equal(result.reason, 'already_pro')
    const paidAccess = await scalar('select public.summer_get_access()')
    assert.equal(paidAccess.access_kind, 'paid')
    assert.equal(paidAccess.subscription_status, 'pro')
    assert.equal(paidAccess.trial_used, false)

    await asDatabaseOwner()
    assert.equal(
      Number(await scalar(`select count(*) from summer_private.pro_trials where user_id in ('${admin}','${paidMember}')`)),
      0,
    )
  })

  let trialStartedAt
  let trialExpiresAt
  await t.test('trial lasts exactly seven server days without creating a subscription', async () => {
    await asDatabaseOwner()
    await db.query(`insert into public.summer_nutrition_generations(user_id,status,created_at)
      values ('${trialMember}','completed',now() - interval '1 hour')`)

    await asUser(trialMember)
    const before = await scalar('select public.summer_get_access()')
    assert.equal(before.access_kind, 'free')
    assert.equal(before.subscription_status, 'free')
    assert.equal(before.trial_available, true)
    assert.equal(before.trial_used, false)

    const started = await scalar('select public.summer_start_pro_trial()')
    assert.equal(started.started, true)
    assert.equal(started.already_used, false)
    assert.equal(started.reason, 'started')
    trialStartedAt = started.trial_started_at
    trialExpiresAt = started.trial_expires_at
    assert.equal(
      new Date(trialExpiresAt).getTime() - new Date(trialStartedAt).getTime(),
      7 * 24 * 60 * 60 * 1000,
    )

    const repeated = await scalar('select public.summer_start_pro_trial()')
    assert.equal(repeated.started, false)
    assert.equal(repeated.already_used, true)
    assert.equal(repeated.trial_expires_at, trialExpiresAt)

    const access = await scalar('select public.summer_get_access()')
    assert.equal(access.access_kind, 'trial')
    assert.equal(access.subscription_status, 'free')
    assert.equal(access.subscription_plan, null)
    assert.equal(access.trial_active, true)
    assert.equal(access.trial_available, false)
    assert.equal(access.trial_used, true)
    assert.equal(access.plan, 'plus')
    assert.equal(access.expires_at, trialExpiresAt)
    assert.equal(await scalar('select public.summer_has_pro_access()'), true)
    assert.equal(await scalar('select public.summer_has_paid_access()'), false)

    await asDatabaseOwner()
    assert.equal(
      Number(await scalar(`select count(*) from public.summer_subscriptions where user_id = '${trialMember}'`)),
      0,
    )
    const audit = (await db.query(`select admin_id,action,old_subscription_status,new_subscription_status
      from summer_private.plan_audit where student_id = '${trialMember}'`)).rows
    assert.deepEqual(audit, [{
      admin_id: null,
      action: 'trial_start',
      old_subscription_status: null,
      new_subscription_status: null,
    }])
  })

  await t.test('active trial receives PRO RLS access and one generation within its own period', async () => {
    await asDatabaseOwner()
    await db.query(`insert into public.summer_meal_plans(
      user_id,profile_snapshot,targets,days,shopping_list
    ) values (
      '${trialMember}','{}','{}','[{},{},{},{},{},{},{}]','[]'
    )`)
    await asUser(trialMember)
    await db.query("insert into public.summer_calorie_entries(day,label,calories) values (current_date,'Almoço',500)")
    await db.query("update public.summer_calorie_entries set calories = 550 where label = 'Almoço'")
    await db.query('insert into public.summer_water_entries(amount_ml) values (500)')
    await db.query(`insert into public.summer_nutrition_profiles(
      goal,age,height_cm,weight_kg,activity_level,dietary_preference,meals_per_day,water_target_ml
    ) values ('maintain',28,175,75,'moderate','balanced',4,2500)`)
    assert.equal((await db.query('select * from public.summer_calorie_entries')).rows.length, 1)
    assert.equal((await db.query('select * from public.summer_water_entries')).rows.length, 1)
    assert.equal((await db.query('select * from public.summer_nutrition_profiles')).rows.length, 1)
    assert.equal((await db.query('select * from public.summer_meal_plans')).rows.length, 1)
    assert.ok((await db.query('select * from public.summer_exercise_library')).rows.length >= 30)

    const photoAction = await scalar("select public.summer_begin_nutrition_ai_action('food_photo')")
    assert.ok(photoAction.action_id)

    const access = await scalar('select public.summer_get_nutrition_access()')
    assert.equal(access.is_pro, true)
    assert.equal(access.is_trial, true)
    assert.equal(access.allowed, true)
    assert.equal(access.used, 0, 'a generation before trial start must not consume its allowance')
    assert.equal(access.remaining, 1)
    assert.equal(access.monthly_limit, 1)
    assert.equal(access.period_ends_at, trialExpiresAt)

    const generation = await scalar('select public.summer_begin_nutrition_generation()')
    assert.ok(generation.generation_id)
    assert.equal(generation.remaining, 0)
    await assert.rejects(
      () => db.query('select public.summer_begin_nutrition_generation()'),
      /Limite mensal de cardapios atingido/,
    )

    const stalePaidPolicies = await scalar(`select count(*) from pg_policies
      where schemaname = 'public'
        and tablename = 'summer_calorie_entries'
        and (coalesce(qual, '') like '%summer_has_paid_access%'
          or coalesce(with_check, '') like '%summer_has_paid_access%')`)
    assert.equal(Number(stalePaidPolicies), 0)
  })

  await t.test('suspension blocks an active trial without deleting it', async () => {
    await asDatabaseOwner()
    await db.query(`update public.summer_academy_memberships
      set status = 'suspended' where user_id = '${trialMember}'`)
    await asUser(trialMember)
    let access = await scalar('select public.summer_get_access()')
    assert.equal(access.access_kind, 'free')
    assert.equal(access.trial_active, false)
    assert.equal(access.trial_used, true)
    assert.equal(await scalar('select public.summer_has_pro_access()'), false)

    await asDatabaseOwner()
    assert.equal(
      Number(await scalar(`select count(*) from summer_private.pro_trials where user_id = '${trialMember}'`)),
      1,
    )
    await db.query(`update public.summer_academy_memberships
      set status = 'active' where user_id = '${trialMember}'`)
    await asUser(trialMember)
    access = await scalar('select public.summer_get_access()')
    assert.equal(access.access_kind, 'trial')
    assert.equal(access.trial_active, true)
  })

  await t.test('server expiry automatically removes every PRO permission and cannot restart', async () => {
    await asDatabaseOwner()
    await db.query(`update summer_private.pro_trials
      set started_at = now() - interval '8 days',
          expires_at = now() - interval '1 day'
      where user_id = '${trialMember}'`)

    await asUser(trialMember)
    const access = await scalar('select public.summer_get_access()')
    assert.equal(access.access_kind, 'free')
    assert.equal(access.subscription_status, 'free')
    assert.equal(access.trial_active, false)
    assert.equal(access.trial_available, false)
    assert.equal(access.trial_used, true)
    assert.equal(access.plan, 'basic')
    assert.equal(await scalar('select public.summer_has_pro_access()'), false)
    assert.equal(await scalar('select public.summer_has_paid_access()'), false)
    assert.equal((await db.query('select * from public.summer_calorie_entries')).rows.length, 0)
    assert.equal((await db.query('select * from public.summer_water_entries')).rows.length, 0)
    assert.equal((await db.query('select * from public.summer_nutrition_profiles')).rows.length, 0)
    assert.equal((await db.query('select * from public.summer_meal_plans')).rows.length, 0)
    assert.equal((await db.query('select * from public.summer_exercise_library')).rows.length, 0)
    await assert.rejects(
      () => db.query("insert into public.summer_calorie_entries(day,label,calories) values (current_date,'Jantar',400)"),
      /row-level security/,
    )
    await assert.rejects(
      () => db.query('select public.summer_begin_nutrition_generation()'),
      /Summer PRO/,
    )
    await assert.rejects(
      () => db.query("select public.summer_begin_nutrition_ai_action('food_photo')"),
      /Summer PRO/,
    )

    const restart = await scalar('select public.summer_start_pro_trial()')
    assert.equal(restart.started, false)
    assert.equal(restart.already_used, true)
    assert.equal(restart.trial_active, false)

    await asDatabaseOwner()
    assert.equal(
      Number(await scalar(`select count(*) from public.summer_calorie_entries where user_id = '${trialMember}'`)),
      1,
      'expiry hides but preserves member data',
    )
    assert.equal(
      Number(await scalar(`select count(*) from public.summer_subscriptions where user_id = '${trialMember}'`)),
      0,
    )
  })
})
