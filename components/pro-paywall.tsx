"use client";
import { useEffect, useState } from "react";
import { trackProConversionEvent } from "@/lib/pro-conversion-events";
import { useModalDialog } from "@/lib/use-modal-dialog";
import { createClient } from "@/lib/supabase/client";

import {
  BarChart3,
  Camera,
  Crown,
  Droplets,
  Trophy,
  Utensils,
  X,
} from "lucide-react";
import {
  formatBRL,
  monthlyPrice,
  type PlanConfig,
} from "@/lib/plans";
import {
  annualMonthlyEquivalent,
  type ProTrialOffer,
} from "@/lib/pro-checkout";
import styles from "./pro-membership.module.css";

const highlights = [
  { icon: BarChart3, label: "Veja se suas cargas estão evoluindo" },
  { icon: Trophy, label: "Acompanhe recordes, frequência e constância" },
  { icon: Utensils, label: "Crie um cardápio de 7 dias para seu objetivo" },
  { icon: Camera, label: "Fotografe refeições e acompanhe calorias e proteínas" },
  { icon: Droplets, label: "Organize água, alimentação e lista de compras" },
];

export function ProPaywall({
  onClose,
  onSubscribe,
  trial,
  onStartTrial,
  config: suppliedConfig,
}: {
  onClose: () => void;
  onSubscribe: () => void;
  trial?: ProTrialOffer;
  onStartTrial?: () => void | Promise<void>;
  config?: PlanConfig;
}) {
  const dialog = useModalDialog(onClose);
  const [loadedConfig, setLoadedConfig] = useState<PlanConfig | null>(null);
  const config = suppliedConfig || loadedConfig;
  useEffect(() => {
    if (suppliedConfig) return;
    let active = true;
    void (async () => {
      try {
        const { data, error } = await createClient().rpc("summer_get_plan_config");
        if (active && !error && data) setLoadedConfig(data as PlanConfig);
      } catch { /* The plans screen can retry loading verified prices. */ }
    })();
    return () => { active = false; };
  }, [suppliedConfig]);
  useEffect(() => { trackProConversionEvent("offer_viewed", "paywall"); }, []);
  const [startingTrial, setStartingTrial] = useState(false);
  const [trialError, setTrialError] = useState("");
  const canStartTrial = Boolean(trial?.eligible && !trial.active && onStartTrial);
  async function startTrial() {
    if (!onStartTrial || startingTrial) return;
    setStartingTrial(true);
    setTrialError("");
    try {
      await onStartTrial();
    } catch {
      setTrialError("Não foi possível iniciar o teste agora. Tente novamente ou veja os planos.");
    } finally {
      setStartingTrial(false);
    }
  }
  return (
    <div className="paywall-overlay" role="presentation">
      <section
        ref={dialog}
        className={`paywall-dialog ${styles.paywall}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        aria-describedby="paywall-payment-note"
      >
        <button
          className="icon-button paywall-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={18} />
        </button>
        <div className="paywall-crown">
          <Crown size={30} />
        </div>
        <p className="eyebrow">⭐ SUMMER PRO</p>
        <h2 id="paywall-title">Descubra o que está mudando no seu treino e organize sua alimentação.</h2>
        <p className={styles.paywallLead}>O Summer PRO transforma seus registros em evolução visível e ajuda você a cuidar da semana inteira em um só lugar.</p>
        <div className="paywall-benefits">
          {highlights.map(({ icon: Icon, label }) => (
            <div key={label}>
              <Icon size={19} />
              <span>{label}</span>
            </div>
          ))}
        </div>
        {config && <div className="paywall-price">
          <strong>{formatBRL(monthlyPrice(config))}{config.promotion_active ? " no 1º mês" : "/mês"}</strong>
          {config.promotion_active && <span>Depois, {formatBRL(config.pro_monthly_price_cents)}/mês</span>}
          <span>Plano anual equivale a {formatBRL(annualMonthlyEquivalent(config.pro_annual_price_cents))}/mês</span>
        </div>}
        <p id="paywall-payment-note" className={styles.paywallNote}>Pagamento pelo Mercado Pago com liberação após aprovação, ou PIX com conferência manual. Não há renovação automática.</p>
        {canStartTrial && <button className={`primary-button full-button ${styles.trialButton}`} disabled={startingTrial} onClick={() => void startTrial()}>
          <Crown size={17} />
          {startingTrial ? "LIBERANDO SEU TESTE..." : "TESTAR PRO GRÁTIS POR 7 DIAS"}
        </button>}
        <button className={canStartTrial ? `secondary-button full-button ${styles.plansButton}` : "primary-button full-button"} onClick={onSubscribe}>
          <Crown size={17} />
          {canStartTrial ? "VER PLANOS" : "VER PLANOS E ASSINAR"}
        </button>
        {trialError && <p className={styles.trialError} role="alert">{trialError}</p>}
        <button className="text-button" onClick={onClose}>
          Agora não
        </button>
      </section>
    </div>
  );
}
