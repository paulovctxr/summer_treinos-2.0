import { createHmac, timingSafeEqual } from 'node:crypto'

export type MercadoPagoPlan = 'monthly' | 'annual'

export type MercadoPagoCheckout = {
  checkoutId: string
  subscriptionPlan: MercadoPagoPlan
  amountCents: number
  currency: 'BRL'
}

type JsonObject = Record<string, unknown>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAYMENT_ID_PATTERN = /^\d{1,32}$/
const ALLOWED_CHECKOUT_HOSTS = ['mercadopago.com', 'mercadopago.com.br']

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseMercadoPagoPlan(value: unknown): MercadoPagoPlan | null {
  return value === 'monthly' || value === 'annual' ? value : null
}

export function isCheckoutId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function parseCheckoutPayload(value: unknown): MercadoPagoCheckout | null {
  if (!isJsonObject(value)) return null
  const checkoutId = value.checkout_id
  const subscriptionPlan = parseMercadoPagoPlan(value.subscription_plan)
  const amountCents = value.amount_cents
  if (
    !isCheckoutId(checkoutId)
    || !subscriptionPlan
    || !Number.isSafeInteger(amountCents)
    || (amountCents as number) < 100
    || (amountCents as number) > 10_000_000
    || value.currency !== 'BRL'
  ) return null
  return {
    checkoutId,
    subscriptionPlan,
    amountCents: amountCents as number,
    currency: 'BRL',
  }
}

export function getSiteOrigin(value: string | undefined, production: boolean): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (
      url.username
      || url.password
      || url.search
      || url.hash
      || (production && url.protocol !== 'https:')
      || (!production && url.protocol !== 'https:' && !(localhost && url.protocol === 'http:'))
    ) return null
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.origin
  } catch {
    return null
  }
}

export function isAllowedMercadoPagoCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const allowedHost = ALLOWED_CHECKOUT_HOSTS.some(
      host => hostname === host || hostname.endsWith(`.${host}`),
    )
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.port
      && allowedHost
  } catch {
    return false
  }
}

export function getPreferenceResult(value: unknown): { id: string; checkoutUrl: string } | null {
  if (!isJsonObject(value)) return null
  if (
    typeof value.id !== 'string'
    || value.id.length < 1
    || value.id.length > 160
    || !isAllowedMercadoPagoCheckoutUrl(value.init_point)
  ) return null
  return { id: value.id, checkoutUrl: value.init_point }
}

export function buildMercadoPagoPreference(
  checkout: MercadoPagoCheckout,
  siteOrigin: string,
  payerEmail?: string,
): JsonObject {
  const planName = checkout.subscriptionPlan === 'annual' ? 'anual' : 'mensal'
  const preference: JsonObject = {
    items: [{
      id: `summer-pro-${checkout.subscriptionPlan}`,
      title: `Summer PRO — plano ${planName}`,
      description: checkout.subscriptionPlan === 'annual'
        ? 'Acesso ao Summer PRO por um ano'
        : 'Acesso ao Summer PRO por um mes',
      quantity: 1,
      currency_id: 'BRL',
      unit_price: checkout.amountCents / 100,
    }],
    external_reference: checkout.checkoutId,
    notification_url: `${siteOrigin}/api/mercado-pago/webhook`,
    back_urls: {
      success: `${siteOrigin}/pagamento/sucesso`,
      pending: `${siteOrigin}/pagamento/pendente`,
      failure: `${siteOrigin}/pagamento/falha`,
    },
    auto_return: 'approved',
    metadata: { checkout_id: checkout.checkoutId },
    statement_descriptor: 'SUMMER PRO',
  }
  if (payerEmail && payerEmail.length <= 320) preference.payer = { email: payerEmail }
  return preference
}

export function mercadoPagoAmountToCents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  const normalized = String(value).trim()
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 10_000_000
    ? cents
    : null
}

function normalizePaymentId(value: unknown): string | null {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return null
  const paymentId = typeof value === 'number' ? String(value) : value
  return typeof paymentId === 'string' && PAYMENT_ID_PATTERN.test(paymentId)
    ? paymentId
    : null
}

export function extractMercadoPagoPaymentNotification(
  requestUrl: string,
  body: unknown,
): { paymentId: string; isPaymentEvent: boolean } | null {
  const url = new URL(requestUrl)
  const object = isJsonObject(body) ? body : {}
  const data = isJsonObject(object.data) ? object.data : {}
  const rawId = data.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id')
  const paymentId = normalizePaymentId(rawId)
  if (!paymentId) return null
  const rawType = object.type ?? url.searchParams.get('type') ?? object.action
  const type = typeof rawType === 'string' ? rawType.toLowerCase() : ''
  return {
    paymentId,
    isPaymentEvent: type === 'payment' || type.startsWith('payment.'),
  }
}

function safeHexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) return false
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.length > 0
    && leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer)
}

export function verifyMercadoPagoSignature({
  signatureHeader,
  requestId,
  paymentId,
  secret,
}: {
  signatureHeader: string | null
  requestId: string | null
  paymentId: string
  secret: string
}): boolean {
  if (!secret || !signatureHeader || !requestId || requestId.length > 200) return false
  const fields = signatureHeader.split(',').reduce<Record<string, string[]>>((result, part) => {
    const separator = part.indexOf('=')
    if (separator < 1) return result
    const key = part.slice(0, separator).trim().toLowerCase()
    const value = part.slice(separator + 1).trim()
    if (key && value) (result[key] ??= []).push(value)
    return result
  }, {})
  const timestamp = fields.ts?.[0]
  const signatures = fields.v1 ?? []
  if (!timestamp || !/^\d{9,16}$/.test(timestamp) || signatures.length === 0) return false
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${timestamp};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  return signatures.some(candidate => safeHexEqual(candidate, expected))
}

export function parseApprovedPayment(value: unknown): {
  checkoutId: string
  paymentId: string
  amountCents: number
  currency: 'BRL'
} | null {
  if (!isJsonObject(value) || value.status !== 'approved') return null
  const checkoutId = value.external_reference
  const paymentId = normalizePaymentId(value.id)
  const amountCents = mercadoPagoAmountToCents(value.transaction_amount)
  if (
    !isCheckoutId(checkoutId)
    || !paymentId
    || amountCents === null
    || value.currency_id !== 'BRL'
  ) return null
  return { checkoutId, paymentId, amountCents, currency: 'BRL' }
}
