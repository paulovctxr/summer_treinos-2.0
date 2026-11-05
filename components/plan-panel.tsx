"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  Copy,
  CreditCard,
  Crown,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Utensils,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_PLAN_CONFIG,
  FREE_FEATURES,
  PRO_FEATURES,
  effectiveExpiresAt,
  formatBRL,
  isProAccess,
  isTrialAccess,
  monthlyPrice,
  subscriptionPlanLabel,
  type Access,
  type PlanConfig,
  type SubscriptionPlan,
  type SubscriptionRequest,
} from "@/lib/plans";
import {
  annualMonthlyEquivalent,
  proPaymentWhatsAppUrl,
} from "@/lib/pro-checkout";
import { trackProConversionEvent } from "@/lib/pro-conversion-events";
import styles from "./pro-membership.module.css";
import { ProTestimonials } from "./pro-testimonials";

function date(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    : "—";
}

function safeCheckoutUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const mercadoPago = ["mercadopago.com", "mercadopago.com.br"].some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
    return url.protocol === "https:" && mercadoPago ? url.href : null;
  } catch {
    return null;
  }
}

export function PlanPanel({
  access,
  userEmail,
  trialLoading,
  onStartTrial,
  onRefreshAccess,
  onOpenNutrition,
}: {
  access: Access | null;
  userEmail: string;
  trialLoading: boolean;
  onStartTrial: () => Promise<void>;
  onRefreshAccess: () => Promise<void>;
  onOpenNutrition: () => void;
}) {
  const [config, setConfig] = useState<PlanConfig>(DEFAULT_PLAN_CONFIG);
  const [selectedPlan, setSelectedPlan] =
    useState<SubscriptionPlan>("monthly");
  const [request, setRequest] = useState<SubscriptionRequest | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [manualPixOpen, setManualPixOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [automaticBusy, setAutomaticBusy] = useState(false);
  const [planDataReady, setPlanDataReady] = useState(false);
  const [planDataError, setPlanDataError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [pixCopied, setPixCopied] = useState(false);
  const checkoutTitleRef = useRef<HTMLHeadingElement>(null);
  const subscribeButtonRef = useRef<HTMLButtonElement>(null);
  const proAccess = isProAccess(access);
  const trialActive = isTrialAccess(access);
  const subscribed = Boolean(
    access?.is_admin || access?.subscription_status === "pro",
  );
  const trialAvailable = Boolean(access?.trial_available && !proAccess);
  const subscriptionVersion = access ? JSON.stringify([
    subscribed, trialActive, access.subscription_plan, access.subscription_started_at,
    access.subscription_expires_at, access.trial_expires_at, access.subscription_updated_at,
  ]) : null;
  const previousSubscription = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPlanDataReady(false);
    setPlanDataError(false);
    // A confirmed approval or renewal replaces the pending checkout in place.
    if (subscribed && previousSubscription.current && previousSubscription.current !== subscriptionVersion) {
      setCheckoutOpen(false);
      setRequest(null);
      setMessage("");
    }
    previousSubscription.current = subscriptionVersion;
    async function loadPlanData() {
    const supabase = createClient();
    try {
      const [planConfig, pending] = await Promise.all([
        supabase.rpc("summer_get_plan_config"),
        supabase
          .from("summer_subscription_requests")
          .select("id,subscription_plan,amount_cents,status,created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (planConfig.error || !planConfig.data || pending.error) throw new Error("plan unavailable");
      setConfig(planConfig.data as PlanConfig);
      if (pending.data) {
        const current = pending.data as SubscriptionRequest;
        setRequest(current);
        setSelectedPlan(current.subscription_plan);
        setCheckoutOpen(true);
          setManualPixOpen(true);
      } else {
        setRequest(null);
          if (subscribed) {
          setCheckoutOpen(false);
          setMessage("");
        }
      }
      setPlanDataReady(true);
    } catch {
      if (!cancelled) setPlanDataError(true);
    }
    }
    void loadPlanData();
    return () => { cancelled = true; };
  }, [subscribed, subscriptionVersion, loadVersion]);

  useEffect(() => {
    if (!checkoutOpen || !planDataReady) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    checkoutTitleRef.current?.focus({ preventScroll: true });
  }, [checkoutOpen, planDataReady]);

  useEffect(() => {
    if (planDataReady && !subscribed)
      void trackProConversionEvent("offer_viewed", "plans");
  }, [planDataReady, subscribed]);

  useEffect(() => {
    const refresh = () => void onRefreshAccess();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [onRefreshAccess]);

  function returnToPlans() {
    setCheckoutOpen(false);
    setManualPixOpen(false);
    setMessage("");
    setPixCopied(false);
    window.requestAnimationFrame(() => subscribeButtonRef.current?.focus());
  }

  function openCheckout() {
    setMessage("");
    setPixCopied(false);
    setManualPixOpen(Boolean(request));
    setCheckoutOpen(true);
    void trackProConversionEvent("checkout_opened", "plans");
  }

  async function startTrial() {
    if (trialLoading || !trialAvailable) return;
    setMessage("");
    try {
      await onStartTrial();
      void trackProConversionEvent("trial_started", "trial");
    } catch {
      setMessage(
        "Não foi possível iniciar o teste agora. Confira sua conexão e tente novamente.",
      );
    }
  }

  async function startAutomaticCheckout() {
    if (automaticBusy) return;
    setAutomaticBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/mercado-pago/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const result: unknown = await response.json();
      const checkoutUrl =
        result && typeof result === "object" && "checkoutUrl" in result
          ? safeCheckoutUrl(result.checkoutUrl)
          : null;
      if (!response.ok || !checkoutUrl) {
        const error =
          result && typeof result === "object" && "error" in result
            ? String(result.error)
            : "Não foi possível abrir o Mercado Pago.";
        throw new Error(error);
      }
      await trackProConversionEvent("mercado_pago_opened", "mercado_pago");
      window.location.assign(checkoutUrl);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? `${error.message} Você ainda pode usar o PIX manual abaixo.`
          : "O pagamento automático está indisponível agora. Use o PIX manual abaixo.",
      );
      setManualPixOpen(true);
    } finally {
      setAutomaticBusy(false);
    }
  }

  async function requestReview() {
    if (busy || !planDataReady) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await createClient().rpc(
        "summer_request_subscription",
        { p_subscription_plan: selectedPlan },
      );
      if (error || !data?.request_id) throw error;
      setRequest({
        id: Number(data.request_id),
        subscription_plan: data.subscription_plan as SubscriptionPlan,
        amount_cents: Number(data.amount_cents),
        status: "pending",
        created_at: new Date().toISOString(),
      });
      setMessage(
        "Solicitação enviada. O Summer PRO será liberado somente após a conferência do pagamento pelo administrador.",
      );
      void trackProConversionEvent("subscription_requested", "checkout");
    } catch {
      setMessage(
        "Não foi possível enviar a solicitação. Confira sua conexão e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyPix() {
    try {
      await navigator.clipboard.writeText(config.pix_key);
      setPixCopied(true);
      setMessage("Chave PIX copiada.");
      void trackProConversionEvent("pix_copied", "checkout");
    } catch {
      setPixCopied(false);
      setMessage(
        "Não foi possível copiar. Selecione a chave abaixo e copie manualmente.",
      );
    }
  }

  const checkoutPlan = request?.subscription_plan || selectedPlan;
  const checkoutAmount =
    request?.amount_cents ||
    (checkoutPlan === "annual"
      ? config.pro_annual_price_cents
      : monthlyPrice(config));
  const annualEquivalent = annualMonthlyEquivalent(config.pro_annual_price_cents);

  function openNutrition() {
    void trackProConversionEvent("pro_feature_opened", "plans");
    onOpenNutrition();
  }

  return (
    <section className={`tab-panel pro-page ${styles.membership}`} aria-busy={!planDataReady && !planDataError}>
      {!planDataReady && !planDataError && <div className={styles.loading} role="status"><RefreshCw size={20} aria-hidden="true" /><span>Conferindo seus planos e solicitações...</span></div>}
      {planDataError && <div className={styles.loadError} role="alert"><strong>Não foi possível carregar seus planos</strong><p>Vamos conferir os valores e suas solicitações antes de continuar.</p><button type="button" className="secondary-button" onClick={() => setLoadVersion((version) => version + 1)}><RefreshCw size={17} />Tentar novamente</button></div>}
      {planDataReady && !checkoutOpen && (
        <>
          {proAccess && <div className="subscription-tools-link"><div><strong>{trialActive ? "Seu teste grátis PRO está liberado" : "Seu espaço PRO está liberado"}</strong><p>Acesse cardápio com IA, diário alimentar, registro por foto, água e sua evolução completa.</p></div><button className="primary-button" onClick={openNutrition}><Utensils size={17} />Abrir meus recursos</button></div>}

          {trialAvailable && (
            <section className={styles.trialOffer} aria-label="Teste gratuito Summer PRO">
              <span className={styles.trialIcon} aria-hidden="true"><Sparkles size={23} /></span>
              <div>
                <p className="eyebrow">EXPERIMENTE ANTES DE ASSINAR</p>
                <h3>Use todo o Summer PRO por 7 dias</h3>
                <p>Sem cartão e sem cobrança automática. Ao final, sua conta volta sozinha ao plano grátis e seus dados ficam guardados.</p>
              </div>
              <button type="button" className="primary-button" disabled={trialLoading} onClick={() => void startTrial()}>
                <Crown size={17} />{trialLoading ? "LIBERANDO..." : "COMEÇAR 7 DIAS GRÁTIS"}
              </button>
            </section>
          )}

          {(subscribed || trialActive) && (
            <div className="subscription-section-heading">
              <p className="eyebrow">{trialActive ? "SEU TESTE" : "SUA ASSINATURA"}</p>
              <h3>{trialActive ? "Teste grátis e assinatura" : "Plano e renovação"}</h3>
            </div>
          )}

          <div className="pricing-grid">
            <article className="pricing-card free-card">
              <div className="pricing-card-top">
                <div>
                  <span className="plan-kicker">PARA TREINAR</span>
                  <h3>Summer Grátis</h3>
                </div>
                {!proAccess && <span className="current-plan-badge">Plano atual</span>}
              </div>
              <div className="plan-price">
                <strong>{formatBRL(config.free_price_cents)}</strong>
                <span>para sempre</span>
              </div>
              <p className="plan-message">
                Seu treino da academia, agora no celular.
              </p>
              <ul className="feature-list">
                {FREE_FEATURES.map((feature) => (
                  <li key={feature}>
                    <Check size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>

            <article className="pricing-card pro-card">
              <span className="best-value">{selectedPlan === "annual" ? "MELHOR CUSTO-BENEFÍCIO · ANUAL" : "EVOLUÇÃO COMPLETA"}</span>
              <div className="pricing-card-top">
                <div>
                  <span className="plan-kicker">⭐ TREINO + ALIMENTAÇÃO</span>
                  <h3>Summer PRO</h3>
                </div>
                {subscribed && <span className="current-plan-badge dark">Plano atual</span>}
                {trialActive && !subscribed && <span className="current-plan-badge dark">Teste ativo</span>}
              </div>
              <div className="billing-toggle" aria-label="Escolha a periodicidade">
                <button
                  className={selectedPlan === "monthly" ? "active" : ""}
                  aria-pressed={selectedPlan === "monthly"}
                  onClick={() => setSelectedPlan("monthly")}
                  type="button"
                >
                  Mensal
                </button>
                <button
                  className={selectedPlan === "annual" ? "active" : ""}
                  aria-pressed={selectedPlan === "annual"}
                  onClick={() => setSelectedPlan("annual")}
                  type="button"
                >
                  Anual
                </button>
              </div>
              <div className="plan-price pro-price">
                <strong>
                  {formatBRL(
                    selectedPlan === "annual"
                      ? annualEquivalent
                      : monthlyPrice(config),
                  )}
                </strong>
                <span>/mês</span>
              </div>
              {selectedPlan === "annual" && (
                <p className="annual-saving">
                  {formatBRL(config.pro_annual_price_cents)} por ano · economize {formatBRL(config.annual_savings_cents)}
                </p>
              )}
              {config.promotion_active && selectedPlan === "monthly" && (
                <p className="annual-saving">
                  1º mês por {formatBRL(config.promotional_monthly_price_cents)}. Depois, {formatBRL(config.pro_monthly_price_cents)}/mês.
                </p>
              )}
              <p className={styles.outcomeLead}>Veja sua constância, acompanhe cargas e organize sete dias de alimentação em um único lugar.</p>
              <ul className="feature-list pro-features">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature}>
                    <Check size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                ref={subscribeButtonRef}
                type="button"
                className="primary-button full-button pro-subscribe"
                onClick={openCheckout}
              >
                <Crown size={17} />
                {trialActive ? "ASSINAR PARA CONTINUAR" : subscribed ? "RENOVAR SUMMER PRO" : "ASSINAR SUMMER PRO"}
              </button>
              {(subscribed || trialActive) && (
                <p className="active-until">
                  {trialActive ? "Teste grátis" : subscriptionPlanLabel(access?.subscription_plan)} · válido até{" "}
                  {date(effectiveExpiresAt(access))}
                </p>
              )}
            </article>
          </div>
          {!subscribed && <ProTestimonials />}
        </>
      )}

      {planDataReady && checkoutOpen && (
        <>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || automaticBusy}
            onClick={returnToPlans}
          >
            <ArrowLeft size={17} />
            Voltar aos planos
          </button>
          <section className="pix-checkout" aria-labelledby="checkout-title">
            <div className="pix-checkout-heading">
              <div className="pix-icon">
                <ShieldCheck size={24} />
              </div>
              <div>
                <p className="eyebrow">PAGAMENTO SEGURO</p>
                <h3 id="checkout-title" ref={checkoutTitleRef} tabIndex={-1}>
                  Escolha como pagar
                </h3>
              </div>
            </div>
            <div className="pix-order-summary">
              <span>{subscriptionPlanLabel(selectedPlan)}</span>
              <strong>{formatBRL(selectedPlan === "annual" ? config.pro_annual_price_cents : monthlyPrice(config))}</strong>
            </div>

            <article className={styles.automaticPayment}>
              <span className={styles.paymentIcon} aria-hidden="true"><CreditCard size={22} /></span>
              <div>
                <strong>Liberação automática pelo Mercado Pago</strong>
                <p>Pague no ambiente seguro do Mercado Pago. Após a aprovação, o Summer PRO é liberado automaticamente na sua conta.</p>
                <div className={styles.paymentTrust}>
                  <span><BadgeCheck size={15} />Acesso após aprovação</span>
                  <span><ShieldCheck size={15} />Dados de pagamento protegidos</span>
                </div>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={automaticBusy || busy}
                onClick={() => void startAutomaticCheckout()}
              >
                {automaticBusy ? "ABRINDO..." : "PAGAR COM MERCADO PAGO"}
                {!automaticBusy && <ExternalLink size={16} />}
              </button>
            </article>

            <button
              type="button"
              className={`secondary-button full-button ${styles.manualToggle}`}
              aria-expanded={manualPixOpen}
              onClick={() => setManualPixOpen((open) => !open)}
            >
              {manualPixOpen ? "Ocultar PIX manual" : "Prefiro pagar por PIX manual"}
            </button>

            {manualPixOpen && <div className={styles.manualPayment}>
              <div className={styles.manualHeading}>
                <div><p className="eyebrow">PIX COM CONFERÊNCIA MANUAL</p><h4>{request ? "Pagamento aguardando conferência" : "Enviar comprovante"}</h4></div>
                <strong>{formatBRL(checkoutAmount)}</strong>
              </div>
              <ol className={styles.paymentSteps} aria-label="Como liberar o Summer PRO por PIX">
                <li><span>1</span><div><strong>Faça o PIX no seu banco</strong><p>Use a chave e o valor indicados abaixo.</p></div></li>
                <li><span>2</span><div><strong>Envie seu comprovante</strong><p>O WhatsApp já leva seu plano, valor e e-mail.</p></div></li>
                <li><span>3</span><div><strong>Aguarde a conferência</strong><p>O administrador libera o PRO após confirmar o pagamento.</p></div></li>
              </ol>
              <div className="pix-receiver-note"><strong>Sobre o pagamento</strong><span>O valor será recebido por Paulo, desenvolvedor da aplicação. Envie o comprovante para a conferência manual.</span></div>
              <label className={styles.pixLabel} htmlFor="pix-key">Chave PIX</label>
              <input id="pix-key" className={styles.pixKey} readOnly value={config.pix_key} onFocus={(event) => event.currentTarget.select()} />
              <button className="secondary-button" onClick={() => void copyPix()}>
                {pixCopied ? <Check size={16} /> : <Copy size={16} />}{pixCopied ? "Chave copiada" : "Copiar chave PIX"}
              </button>
              <a
                className="secondary-button pix-whatsapp-button"
                href={proPaymentWhatsAppUrl({ phone: "5521974312734", plan: checkoutPlan, amountCents: checkoutAmount, email: userEmail })}
                target="_blank"
                rel="noreferrer"
                onClick={() => void trackProConversionEvent("whatsapp_clicked", "whatsapp")}
              >
                <MessageCircle size={16} />Enviar comprovante pelo WhatsApp
              </a>
              {request ? <div className="pending-payment"><CalendarDays size={19} /><div><strong>Solicitação enviada</strong><span>Enviada em {date(request.created_at)}. Não é necessário solicitar novamente.</span></div></div> : (
                <button className="primary-button full-button" disabled={busy || automaticBusy} onClick={() => void requestReview()}>
                  {busy ? "ENVIANDO..." : "JÁ FIZ O PIX — ENVIAR PARA ANÁLISE"}
                </button>
              )}
              <small>No PIX manual, a liberação acontece após a conferência e não existe cobrança automática.</small>
            </div>}
          </section>
        </>
      )}

      <div role="status" aria-live="polite">
        {message && <p className="notice">{message}</p>}
      </div>
    </section>
  );
}
