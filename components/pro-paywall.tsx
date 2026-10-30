"use client";
import { useModalDialog } from "@/lib/use-modal-dialog";

import {
  BarChart3,
  Camera,
  Crown,
  Droplets,
  Flame,
  ShoppingBasket,
  Trophy,
  Utensils,
  X,
} from "lucide-react";
import {
  DEFAULT_PLAN_CONFIG,
  formatBRL,
  monthlyPrice,
  type PlanConfig,
} from "@/lib/plans";
import styles from "./pro-membership.module.css";

const highlights = [
  { icon: Utensils, label: "Nutrição com IA" },
  { icon: Camera, label: "Registrar alimentação por foto" },
  { icon: Flame, label: "Calorias e macronutrientes" },
  { icon: Droplets, label: "Controle de água" },
  { icon: BarChart3, label: "Gráficos de evolução" },
  { icon: Trophy, label: "Recordes pessoais" },
  { icon: ShoppingBasket, label: "Lista de compras" },
];

export function ProPaywall({
  onClose,
  onSubscribe,
  config = DEFAULT_PLAN_CONFIG,
}: {
  onClose: () => void;
  onSubscribe: () => void;
  config?: PlanConfig;
}) {
  const dialog = useModalDialog(onClose);
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
        <h2 id="paywall-title">
          Leve seus treinos e sua alimentação para o próximo nível.
        </h2>
        <div className="paywall-benefits">
          {highlights.map(({ icon: Icon, label }) => (
            <div key={label}>
              <Icon size={19} />
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="paywall-price">
          <strong>{formatBRL(monthlyPrice(config))}{config.promotion_active ? " no 1º mês" : "/mês"}</strong>
          {config.promotion_active && <span>Depois, {formatBRL(config.pro_monthly_price_cents)}/mês</span>}
          <span>ou {formatBRL(config.pro_annual_price_cents)}/ano</span>
        </div>
        <p id="paywall-payment-note" className={styles.paywallNote}>Pagamento por PIX, com liberação após conferência do administrador. Sem cobrança automática.</p>
        <button className="primary-button full-button" onClick={onSubscribe}>
          <Crown size={17} />
          CONHECER OS PLANOS
        </button>
        <button className="text-button" onClick={onClose}>
          Agora não
        </button>
      </section>
    </div>
  );
}
