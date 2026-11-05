import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import {
  buildMercadoPagoPreference,
  extractMercadoPagoPaymentNotification,
  getPreferenceResult,
  getSiteOrigin,
  isAllowedMercadoPagoCheckoutUrl,
  mercadoPagoAmountToCents,
  parseApprovedPayment,
  parseCheckoutPayload,
  verifyMercadoPagoSignature,
} from '../lib/mercado-pago.ts'

const checkoutId = 'da3cb71f-b5e7-40f6-9a7e-f691c2869c8d'

test('Mercado Pago validation only accepts trusted URLs, exact BRL amounts and UUID references', () => {
  assert.equal(isAllowedMercadoPagoCheckoutUrl('https://www.mercadopago.com.br/checkout/v1/redirect'), true)
  assert.equal(isAllowedMercadoPagoCheckoutUrl('https://sandbox.mercadopago.com/checkout/v1/redirect'), true)
  assert.equal(isAllowedMercadoPagoCheckoutUrl('http://www.mercadopago.com.br/checkout'), false)
  assert.equal(isAllowedMercadoPagoCheckoutUrl('https://mercadopago.com.br.evil.test/checkout'), false)
  assert.equal(isAllowedMercadoPagoCheckoutUrl('https://user@mercadopago.com.br/checkout'), false)
  assert.equal(getSiteOrigin('https://summer.example/', true), 'https://summer.example')
  assert.equal(getSiteOrigin('http://summer.example', true), null)
  assert.equal(getSiteOrigin('http://localhost:3000', false), 'http://localhost:3000')

  assert.equal(mercadoPagoAmountToCents(10), 1_000)
  assert.equal(mercadoPagoAmountToCents(119.9), 11_990)
  assert.equal(mercadoPagoAmountToCents('14.90'), 1_490)
  assert.equal(mercadoPagoAmountToCents('14.999'), null)
  assert.equal(mercadoPagoAmountToCents(-1), null)

  assert.deepEqual(parseCheckoutPayload({
    checkout_id: checkoutId,
    subscription_plan: 'annual',
    amount_cents: 11_990,
    currency: 'BRL',
  }), {
    checkoutId,
    subscriptionPlan: 'annual',
    amountCents: 11_990,
    currency: 'BRL',
  })
  assert.equal(parseCheckoutPayload({ checkout_id: checkoutId, subscription_plan: 'annual', amount_cents: 1, currency: 'BRL' }), null)

  assert.deepEqual(parseApprovedPayment({
    id: 123456789,
    status: 'approved',
    external_reference: checkoutId,
    transaction_amount: 119.9,
    currency_id: 'BRL',
  }), { checkoutId, paymentId: '123456789', amountCents: 11_990, currency: 'BRL' })
  assert.equal(parseApprovedPayment({
    id: 123456789,
    status: 'approved',
    external_reference: checkoutId,
    transaction_amount: 119.9,
    currency_id: 'USD',
  }), null)
})

test('preference and webhook helpers keep the checkout reference server controlled', () => {
  const checkout = {
    checkoutId,
    subscriptionPlan: 'monthly',
    amountCents: 1_000,
    currency: 'BRL',
  }
  const preference = buildMercadoPagoPreference(checkout, 'https://summer.example', 'aluno@example.test')
  assert.equal(preference.external_reference, checkoutId)
  assert.equal(preference.notification_url, 'https://summer.example/api/mercado-pago/webhook')
  assert.equal(preference.items[0].unit_price, 10)
  assert.equal(preference.back_urls.success, 'https://summer.example/pagamento/sucesso')

  assert.deepEqual(getPreferenceResult({
    id: '123456-pref',
    init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123',
  }), {
    id: '123456-pref',
    checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123',
  })
  assert.equal(getPreferenceResult({ id: 'x', init_point: 'https://phishing.example' }), null)

  assert.deepEqual(extractMercadoPagoPaymentNotification(
    'https://summer.example/api/mercado-pago/webhook?type=payment&data.id=987654321',
    {},
  ), { paymentId: '987654321', isPaymentEvent: true })
  assert.deepEqual(extractMercadoPagoPaymentNotification(
    'https://summer.example/api/mercado-pago/webhook',
    { action: 'payment.updated', data: { id: '987654321' } },
  ), { paymentId: '987654321', isPaymentEvent: true })
})

test('Mercado Pago webhook signature uses constant format and rejects tampering', () => {
  const secret = 'webhook-secret-for-tests'
  const requestId = 'request-123'
  const paymentId = '987654321'
  const timestamp = '1793520000'
  const digest = createHmac('sha256', secret)
    .update(`id:${paymentId};request-id:${requestId};ts:${timestamp};`)
    .digest('hex')
  assert.equal(verifyMercadoPagoSignature({
    signatureHeader: `ts=${timestamp},v1=${digest}`,
    requestId,
    paymentId,
    secret,
  }), true)
  assert.equal(verifyMercadoPagoSignature({
    signatureHeader: `ts=${timestamp},v1=${digest}`,
    requestId,
    paymentId: '987654322',
    secret,
  }), false)
  assert.equal(verifyMercadoPagoSignature({
    signatureHeader: null,
    requestId,
    paymentId,
    secret,
  }), false)
})

test('database checkout uses server price and payment confirmation is atomic and idempotent', async () => {
  const db = new PGlite()
  const alice = '00000000-0000-0000-0000-000000000102'
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create schema storage;
    create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$ select true $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
      values ('${alice}','alice-mp@example.test',now(),'{}');`)

  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
    .filter(name => name.endsWith('.sql'))
    .sort()
  for (const migration of migrations)
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'))

  async function asRole(role, userId = '') {
    await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${userId}', false);`)
  }
  const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0]

  await asRole('authenticated', alice)
  assert.equal((await scalar('select public.summer_get_plan_config()')).promotion_active, true)
  await scalar('select public.summer_start_pro_trial()')
  assert.equal((await scalar('select public.summer_get_plan_config()')).promotion_active, true,
    'A free trial does not consume the first paid month')
  const checkout = await scalar("select public.summer_create_mercado_pago_checkout('monthly')")
  assert.equal(checkout.amount_cents, 1_000)
  assert.equal(checkout.currency, 'BRL')
  assert.equal((await scalar('select public.summer_get_plan_config()')).promotion_active, true,
    'An unpaid checkout does not consume the discount')
  await scalar(`select public.summer_attach_mercado_pago_preference('${checkout.checkout_id}', 'preference-1')`)
  await assert.rejects(
    () => db.query(`select public.summer_confirm_mercado_pago_payment('${checkout.checkout_id}','123456789',1000,'BRL','approved')`),
    /permission denied/,
  )

  await asRole('service_role')
  const confirmed = await scalar(`select public.summer_confirm_mercado_pago_payment('${checkout.checkout_id}','123456789',1000,'BRL','approved')`)
  assert.equal(confirmed.processed, true)
  assert.equal(confirmed.subscription_status, 'pro')
  const duplicate = await scalar(`select public.summer_confirm_mercado_pago_payment('${checkout.checkout_id}','123456789',1000,'BRL','approved')`)
  assert.equal(duplicate.already_processed, true)
  assert.equal(duplicate.subscription_expires_at, confirmed.subscription_expires_at)

  await asRole('authenticated', alice)
  assert.equal((await scalar('select public.summer_get_plan_config()')).promotion_active, false)
  assert.equal((await scalar("select public.summer_create_mercado_pago_checkout('monthly')")).amount_cents, 1490,
    'Mercado Pago renewals use the regular monthly price')
  assert.equal((await scalar("select public.summer_request_subscription('monthly')")).amount_cents, 1490,
    'Switching from Mercado Pago to manual PIX does not reset the promotion')
  const renewal = await scalar("select public.summer_create_mercado_pago_checkout('annual')")
  await scalar(`select public.summer_attach_mercado_pago_preference('${renewal.checkout_id}', 'preference-2')`)
  await asRole('service_role')
  await assert.rejects(
    () => db.query(`select public.summer_confirm_mercado_pago_payment('${renewal.checkout_id}','987654321',1000,'BRL','approved')`),
    /divergente/,
  )
  const renewed = await scalar(`select public.summer_confirm_mercado_pago_payment('${renewal.checkout_id}','987654321',11990,'BRL','approved')`)
  assert.equal(renewed.subscription_plan, 'annual')
  assert.ok(new Date(renewed.subscription_expires_at).getTime() > new Date(confirmed.subscription_expires_at).getTime() + 300 * 86_400_000)

  await asRole('authenticated', alice)
  const access = await scalar('select public.summer_get_access()')
  assert.equal(access.subscription_status, 'pro')
  assert.equal(access.subscription_plan, 'annual')
  for (const status of ['expired', 'cancelled']) {
    await db.exec(`reset role; update public.summer_subscriptions set subscription_status='${status}', subscription_expires_at=now()-interval '1 day' where user_id='${alice}'`)
    await asRole('authenticated', alice)
    assert.equal((await scalar('select public.summer_get_plan_config()')).promotion_active, false)
    assert.equal((await scalar("select public.summer_create_mercado_pago_checkout('monthly')")).amount_cents, 1490,
      `A ${status} subscription does not restore the first-month promotion`)
  }
  await db.close()
})
