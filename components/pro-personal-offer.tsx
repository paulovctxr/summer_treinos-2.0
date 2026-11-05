"use client";

import { useId, useMemo } from "react";
import { ArrowRight, BarChart3, Crown, Sparkles, Utensils } from "lucide-react";
import type { FitnessData } from "@/lib/fitness";
import { proConversionSummary } from "@/lib/pro-conversion";
import styles from "./pro-personal-offer.module.css";

export function ProPersonalOffer({
  fitness,
  trialEligible,
  trialLoading = false,
  onStartTrial,
  onOpenPlans,
}: {
  fitness: FitnessData;
  trialEligible: boolean;
  trialLoading?: boolean;
  onStartTrial: () => void;
  onOpenPlans: () => void;
}) {
  const titleId = useId();
  const summary = useMemo(() => proConversionSummary(fitness), [fitness]);
  return (
    <section className={styles.offer} aria-labelledby={titleId} aria-busy={trialLoading}>
      <div className={styles.heading}>
        <span className={styles.icon} aria-hidden="true"><Crown size={24} /></span>
        <div>
          <p className={styles.eyebrow}>UMA PRÉVIA DOS SEUS DADOS</p>
          <h3 id={titleId}>{summary.title}</h3>
          <p>{summary.description}</p>
        </div>
      </div>

      {summary.metrics.length > 0 && <div className={styles.metrics} aria-label="Resumo do seu histórico">
        {summary.metrics.map((metric) => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}
      </div>}

      <div className={styles.outcomes}>
        <p><BarChart3 size={19} aria-hidden="true" /><span><strong>Evolução que você consegue enxergar</strong>Gráficos de carga, frequência, histórico completo e recordes pessoais.</span></p>
        <p><Utensils size={19} aria-hidden="true" /><span><strong>Alimentação organizada para a semana</strong>{summary.nutritionMessage}</span></p>
      </div>

      <div className={styles.actions}>
        {trialEligible ? <button type="button" className="primary-button" disabled={trialLoading} onClick={onStartTrial}>
          <Sparkles size={18} aria-hidden="true" />{trialLoading ? "LIBERANDO..." : "TESTAR PRO GRÁTIS POR 7 DIAS"}
        </button> : <button type="button" className="primary-button" onClick={onOpenPlans}>
          <Crown size={18} aria-hidden="true" />VER SUMMER PRO<ArrowRight size={17} aria-hidden="true" />
        </button>}
        {trialEligible && <button type="button" className="text-button" disabled={trialLoading} onClick={onOpenPlans}>Ver planos e benefícios</button>}
      </div>
      {trialEligible && <small>Uma única avaliação gratuita por conta. Não precisa cadastrar cartão e não há cobrança automática.</small>}
    </section>
  );
}
