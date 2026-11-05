"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Eye,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./admin-pro-funnel.module.css";

type FunnelData = {
  period_days: number;
  events: {
    total: number;
    offer_views: number;
    unique_users: number;
    pro_feature_users: number;
  };
  funnel: {
    offers: number;
    trials: number;
    checkouts: number;
    paid: number;
    offer_to_trial_rate: number;
    trial_to_checkout_rate: number;
    checkout_to_paid_rate: number;
  };
};

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseFunnel(value: unknown): FunnelData | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!raw.events || typeof raw.events !== "object") return null;
  if (!raw.funnel || typeof raw.funnel !== "object") return null;
  const events = raw.events as Record<string, unknown>;
  const funnel = raw.funnel as Record<string, unknown>;
  return {
    period_days: finiteNumber(raw.period_days) || 30,
    events: {
      total: finiteNumber(events.total),
      offer_views: finiteNumber(events.offer_views),
      unique_users: finiteNumber(events.unique_users),
      pro_feature_users: finiteNumber(events.pro_feature_users),
    },
    funnel: {
      offers: finiteNumber(funnel.offers),
      trials: finiteNumber(funnel.trials),
      checkouts: finiteNumber(funnel.checkouts),
      paid: finiteNumber(funnel.paid),
      offer_to_trial_rate: finiteNumber(funnel.offer_to_trial_rate),
      trial_to_checkout_rate: finiteNumber(funnel.trial_to_checkout_rate),
      checkout_to_paid_rate: finiteNumber(funnel.checkout_to_paid_rate),
    },
  };
}

function percentage(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function AdminProFunnel() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setUnavailable(false);
    try {
      const { data: response, error } = await createClient().rpc(
        "summer_admin_pro_conversion_funnel",
        { p_days: 30 },
      );
      if (error) throw error;
      const parsed = parseFunnel(response);
      if (!parsed) throw new Error("Funil indisponível");
      setData(parsed);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const steps = [
    { label: "Viram a oferta", value: data?.funnel.offers, icon: Eye },
    { label: "Iniciaram o teste", value: data?.funnel.trials, icon: Sparkles },
    { label: "Abriram o pagamento", value: data?.funnel.checkouts, icon: CreditCard },
    { label: "Viraram PRO", value: data?.funnel.paid, icon: CheckCircle2 },
  ];

  return (
    <section className={styles.card} aria-labelledby="pro-funnel-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CONVERSÃO DO SUMMER PRO</p>
          <h2 id="pro-funnel-title">Do interesse ao plano ativo</h2>
          <p>
            Sinais agregados dos últimos 30 dias, sem exibir nomes, e-mails ou
            dados pessoais dos alunos.
          </p>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => void load()}
          disabled={loading}
          aria-label="Atualizar conversão do Summer PRO"
        >
          <RefreshCw size={16} className={loading ? styles.spinning : undefined} />
          Atualizar
        </button>
      </header>

      {unavailable && !data ? (
        <p className={styles.unavailable} role="status">
          O funil ainda não está disponível. A gestão de alunos continua
          funcionando normalmente; tente atualizar daqui a pouco.
        </p>
      ) : (
        <>
          <div className={styles.steps} aria-busy={loading && !data}>
            {steps.map(({ label, value, icon: Icon }) => (
              <article key={label}>
                <span><Icon size={18} /></span>
                <strong>{value ?? "—"}</strong>
                <small>{label}</small>
              </article>
            ))}
          </div>
          <div className={styles.rates}>
            <p>
              <strong>{data ? percentage(data.funnel.offer_to_trial_rate) : "—"}</strong>
              da oferta para o teste
            </p>
            <p>
              <strong>{data ? percentage(data.funnel.trial_to_checkout_rate) : "—"}</strong>
              do teste para o pagamento
            </p>
            <p>
              <strong>{data ? percentage(data.funnel.checkout_to_paid_rate) : "—"}</strong>
              do pagamento para o PRO
            </p>
          </div>
          {data && (
            <p className={styles.summary}>
              {data.events.total.toLocaleString("pt-BR")} eventos de
              conversão de {data.events.unique_users.toLocaleString("pt-BR")} alunos.
            </p>
          )}
        </>
      )}
    </section>
  );
}
