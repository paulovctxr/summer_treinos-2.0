'use client';
import type { Assessment, AssessmentData } from '@/lib/assessments';
import { calculateBodyComposition } from '@/lib/body-composition';
import styles from './assessments.module.css';

function numeric(value: string | undefined) {
  if (!value?.trim()) return null;
  const result = Number(value.replace(',', '.'));
  return Number.isFinite(result) ? result : null;
}

function percent(value: number | null) {
  return value === null ? 0 : Math.min(100, Math.max(0, value));
}

export function BodyFatChart({ data, model, assessedOn, showEmpty = true }: { data: AssessmentData; model: Assessment['model']; assessedOn: string; showEmpty?: boolean }) {
  const calculation = calculateBodyComposition(data, model, assessedOn);
  const current = calculation.bodyFat ?? numeric(data.body_fat);
  const target = numeric(data.target_fat);
  const fatMass = calculation.fatMass ?? numeric(data.fat_mass);
  const leanMass = calculation.leanMass ?? numeric(data.lean_mass);
  const totalMass = fatMass !== null && leanMass !== null ? fatMass + leanMass : null;
  const compositionPercent = totalMass && totalMass > 0 && fatMass !== null ? fatMass / totalMass * 100 : current;
  const hasValues = current !== null || target !== null || fatMass !== null || leanMass !== null;
  if (!showEmpty && !hasValues) return null;

  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const fatArc = circumference * percent(compositionPercent) / 100;
  const missing = calculation.missing;

  return <section className={styles.compositionChart} aria-label="Gráfico de pizza da composição corporal">
    <div className={styles.compositionHeader}>
      <div><p className={styles.eyebrow}>CÁLCULO AUTOMÁTICO</p><h3>Composição corporal</h3></div>
      <strong>{current === null ? '—' : `${current.toLocaleString('pt-BR')}%`}</strong>
    </div>
    {!hasValues ? <p className={styles.note}>Preencha peso, nascimento e as três dobras do protocolo para calcular a gordura corporal.</p> : <div className={styles.pieLayout}>
      <div className={styles.pieChart} role="img" aria-label={compositionPercent === null ? 'Composição corporal aguardando medidas' : `${compositionPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de gordura e ${Math.max(0, 100 - compositionPercent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de massa magra`}>
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <circle cx="70" cy="70" r={radius} className={styles.pieBase} />
          {compositionPercent !== null && <circle cx="70" cy="70" r={radius} className={styles.pieFat} strokeDasharray={`${fatArc} ${circumference - fatArc}`} />}
        </svg>
        <span>{compositionPercent === null ? '—' : `${compositionPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}<small> gordura</small></span>
      </div>
      <div className={styles.pieDetails}>
        <p><b className={`${styles.compositionDot} ${styles.fatDot}`} /> Gordura corporal <strong>{current === null ? '—' : `${current.toLocaleString('pt-BR')}%`}</strong></p>
        <p><b className={`${styles.compositionDot} ${styles.leanDot}`} /> Massa magra <strong>{compositionPercent === null ? '—' : `${Math.max(0, 100 - compositionPercent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</strong></p>
        {target !== null && <p><b className={`${styles.compositionDot} ${styles.compositionTarget}`} /> Meta <strong>{target.toLocaleString('pt-BR')}%</strong></p>}
        {calculation.bodyFat !== null ? <small>Calculado pelas três dobras, idade e modelo selecionado.</small> : missing.length > 0 && <small>Para calcular, falta: {missing.join(', ')}.</small>}
      </div>
    </div>}
    {(fatMass !== null || leanMass !== null) && <div className={styles.compositionMasses}>
      <div><span>Massa de gordura</span><strong>{fatMass === null ? '—' : `${fatMass.toLocaleString('pt-BR')} kg`}</strong></div>
      <div><span>Massa magra</span><strong>{leanMass === null ? '—' : `${leanMass.toLocaleString('pt-BR')} kg`}</strong></div>
    </div>}
  </section>;
}
