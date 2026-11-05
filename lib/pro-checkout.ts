import { formatBRL, subscriptionPlanLabel, type SubscriptionPlan } from "./plans.ts";

export type ProTrialOffer = {
  eligible: boolean;
  active: boolean;
  expiresAt?: string | null;
};

export function annualMonthlyEquivalent(annualCents: number) {
  return Math.round(Math.max(0, annualCents) / 12);
}

export function proPaymentWhatsAppUrl({
  phone,
  plan,
  amountCents,
  email,
}: {
  phone: string;
  plan: SubscriptionPlan;
  amountCents: number;
  email?: string;
}) {
  const digits = phone.replace(/\D/g, "");
  const account = email?.trim() || "vou informar meu e-mail nesta conversa";
  const message = [
    "Olá! Fiz o PIX do Summer PRO e quero enviar o comprovante.",
    `Plano: ${subscriptionPlanLabel(plan)}.`,
    `Valor: ${formatBRL(amountCents)}.`,
    `E-mail usado no Summer Fit: ${account}.`,
  ].join("\n");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
