import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  extractMercadoPagoPaymentNotification,
  isJsonObject,
  parseApprovedPayment,
  verifyMercadoPagoSignature,
} from '@/lib/mercado-pago'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
}

function json(value: Record<string, unknown>, status = 200) {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

async function readWebhookBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 65_536) throw new Error('large_body')
  const text = await request.text()
  if (text.length > 65_536) throw new Error('large_body')
  if (!text) return {}
  const parsed: unknown = JSON.parse(text)
  return isJsonObject(parsed) ? parsed : {}
}

export async function POST(request: Request) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!accessToken || !serviceRoleKey || !supabaseUrl) {
    return json({ error: 'Integração indisponível.' }, 503)
  }

  let body: unknown
  try {
    body = await readWebhookBody(request)
  } catch {
    return json({ error: 'Notificação inválida.' }, 400)
  }

  const notification = extractMercadoPagoPaymentNotification(request.url, body)
  if (!notification || !notification.isPaymentEvent) return json({ received: true })

  const signatureSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()
  if (signatureSecret && !verifyMercadoPagoSignature({
    signatureHeader: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    paymentId: notification.paymentId,
    secret: signatureSecret,
  })) return json({ error: 'Assinatura inválida.' }, 401)

  let paymentValue: unknown
  try {
    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${notification.paymentId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!paymentResponse.ok) return json({ error: 'Pagamento não encontrado.' }, 502)
    paymentValue = await paymentResponse.json()
  } catch {
    return json({ error: 'Falha ao consultar o pagamento.' }, 502)
  }

  if (isJsonObject(paymentValue) && paymentValue.status !== 'approved') {
    return json({ received: true, processed: false })
  }
  const payment = parseApprovedPayment(paymentValue)
  if (!payment || payment.paymentId !== notification.paymentId) {
    return json({ error: 'Dados do pagamento inválidos.' }, 400)
  }

  try {
    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await supabase.rpc('summer_confirm_mercado_pago_payment', {
      p_checkout_id: payment.checkoutId,
      p_provider_payment_id: payment.paymentId,
      p_amount_cents: payment.amountCents,
      p_currency: payment.currency,
      p_provider_status: 'approved',
    })
    if (error) return json({ error: 'Não foi possível confirmar o pagamento.' }, 500)
    const result = isJsonObject(data) ? data : {}
    return json({
      received: true,
      processed: result.processed === true,
      alreadyProcessed: result.already_processed === true,
    })
  } catch {
    return json({ error: 'Não foi possível confirmar o pagamento.' }, 500)
  }
}
