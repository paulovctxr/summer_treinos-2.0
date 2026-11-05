import Link from 'next/link'
import { CheckCircle2, Clock3, TriangleAlert } from 'lucide-react'
import { notFound } from 'next/navigation'

const RESULT_CONTENT = {
  sucesso: {
    eyebrow: 'Retorno do pagamento',
    title: 'Confira seu acesso no Summer',
    description: 'O acesso é liberado após a confirmação do pagamento pelo Mercado Pago. Volte ao aplicativo para conferir seu plano.',
    Icon: CheckCircle2,
  },
  pendente: {
    eyebrow: 'Pagamento em análise',
    title: 'Acompanhe a aprovação no aplicativo',
    description: 'O Mercado Pago ainda está processando o pagamento. O acesso será liberado automaticamente após a aprovação.',
    Icon: Clock3,
  },
  falha: {
    eyebrow: 'Pagamento não concluído',
    title: 'Você pode tentar novamente',
    description: 'Nenhuma assinatura foi liberada. Volte aos planos para escolher outra forma de pagamento.',
    Icon: TriangleAlert,
  },
} as const

export default async function PaymentResultPage({
  params,
}: {
  params: Promise<{ status: string }>
}) {
  const { status } = await params
  const content = RESULT_CONTENT[status as keyof typeof RESULT_CONTENT]
  if (!content) notFound()
  const Icon = content.Icon

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="payment-result-title">
        <div className="auth-heading">
          <span className="auth-icon" aria-hidden="true"><Icon size={24} /></span>
          <p className="eyebrow">{content.eyebrow}</p>
          <h1 id="payment-result-title">{content.title}</h1>
          <p>{content.description}</p>
        </div>
        <Link className="primary-button full-button" href="/">
          Voltar ao Summer
        </Link>
      </section>
    </main>
  )
}
