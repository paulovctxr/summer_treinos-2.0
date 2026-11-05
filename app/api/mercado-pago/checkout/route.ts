import { createClient } from '@/lib/supabase/server'
import {
  buildMercadoPagoPreference,
  getPreferenceResult,
  getSiteOrigin,
  isJsonObject,
  parseCheckoutPayload,
  parseMercadoPagoPlan,
} from '@/lib/mercado-pago'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: JSON_HEADERS })
}

export async function POST(request: Request) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
  const siteOrigin = getSiteOrigin(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NODE_ENV === 'production',
  )
  if (!accessToken || !siteOrigin) {
    return jsonError('O pagamento automático está temporariamente indisponível.', 503)
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return jsonError('Solicitação muito grande.', 413)
  }

  let body: unknown
  try {
    const text = await request.text()
    if (text.length > 4_096) return jsonError('Solicitação muito grande.', 413)
    if (!text) return jsonError('Informe um plano válido.', 400)
    body = JSON.parse(text) as unknown
  } catch {
    return jsonError('Informe um plano válido.', 400)
  }
  const plan = isJsonObject(body) ? parseMercadoPagoPlan(body.plan) : null
  if (!plan) return jsonError('Informe um plano válido.', 400)

  try {
    const supabase = await createClient()
    const { data: userResult, error: userError } = await supabase.auth.getUser()
    const user = userResult.user
    if (userError || !user) return jsonError('Entre na sua conta para continuar.', 401)

    const { data: checkoutData, error: checkoutError } = await supabase.rpc(
      'summer_create_mercado_pago_checkout',
      { p_subscription_plan: plan },
    )
    const checkout = parseCheckoutPayload(checkoutData)
    if (checkoutError || !checkout) {
      return jsonError('Não foi possível iniciar o pagamento. Tente novamente.', 400)
    }

    const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': checkout.checkoutId,
      },
      body: JSON.stringify(buildMercadoPagoPreference(checkout, siteOrigin, user.email)),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (!preferenceResponse.ok) {
      return jsonError('O Mercado Pago não respondeu. Tente novamente em instantes.', 502)
    }

    const preference = getPreferenceResult(await preferenceResponse.json())
    if (!preference) {
      return jsonError('O Mercado Pago devolveu uma resposta inválida.', 502)
    }

    const { error: attachError } = await supabase.rpc(
      'summer_attach_mercado_pago_preference',
      {
        p_checkout_id: checkout.checkoutId,
        p_preference_id: preference.id,
      },
    )
    if (attachError) {
      return jsonError('Não foi possível concluir o checkout. Tente novamente.', 502)
    }

    return Response.json(
      { checkoutUrl: preference.checkoutUrl },
      { status: 201, headers: JSON_HEADERS },
    )
  } catch {
    return jsonError('O pagamento automático está temporariamente indisponível.', 503)
  }
}
