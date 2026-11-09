'use client';
import type { AssessmentData } from '@/lib/assessments';
import styles from './assessments.module.css';

function numeric(value: string | undefined) {
  if (!value?.trim()) return null;
  const result = Number(value.replace(',', '.'));
  return Number.isFinite(result) ? result : null;
}

function percent(value: number | null) {
  return value === null ? 0 : Math.min(100, Math.max(0, value));
}

export function BodyFatChart({ data, showEmpty = true }: { data: AssessmentData; showEmpty?: boolean }) {
  const current = numeric(data.body_fat);
  const target = numeric(data.target_fat);
  const fatMass = numeric(data.fat_mass);
  const leanMass = numeric(data.lean_mass);
  const totalMass = fatMass !== null && leanMass !== null ? fatMass + leanMass : null;
  if (!showEmpty && current === null && target === null && fatMass === null && leanMass === null) return null;

  return <section className={styles.compositionChart} aria-label="Gráfico da composição corporal">
    <div className={styles.compositionHeader}>
      <div><p className={styles.eyebrow}>ACOMPANHAMENTO AO PREENCHER</p><h3>Gordura corporal</h3></div>
      <strong>{current === null ? '—' : `${current.toLocaleString('pt-BR')}%`}</strong>
    </div>
    {current === null && target === null ? <p className={styles.note}>Informe a gordura corporal para visualizar o gráfico. Ele será atualizado a cada medida preenchida.</p> : <>
      <div className={styles.compositionTrack} role="img" aria-label={current === null ? 'Gordura corporal ainda não informada' : `Gordura corporal atual: ${current} por cento`}>
        <span style={{ width: `${percent(current)}%` }} />
        {target !== null && <i style={{ left: `${percent(target)}%` }} aria-label={`Meta de gordura: ${target} por cento`} />}
      </div>
      <div className={styles.compositionScale}><span>0%</span><span>50%</span><span>100%</span></div>
      <div className={styles.compositionLegend}>
        <span><b className={styles.compositionDot} /> Gordura atual {current === null ? '—' : `${current.toLocaleString('pt-BR')}%`}</span>
        {target !== null && <span><b className={`${styles.compositionDot} ${styles.compositionTarget}`} /> Meta {target.toLocaleString('pt-BR')}%</span>}
      </div>
    </>}
    {(fatMass !== null || leanMass !== null) && <div className={styles.compositionMasses}>
      <div><span>Massa de gordura</span><strong>{fatMass === null ? '—' : `${fatMass.toLocaleString('pt-BR')} kg`}</strong></div>
      <div><span>Massa magra</span><strong>{leanMass === null ? '—' : `${leanMass.toLocaleString('pt-BR')} kg`}</strong></div>
    </div>}
    {totalMass !== null && totalMass > 0 && <div className={styles.massTrack} role="img" aria-label={`Composição do peso: ${fatMass} quilos de gordura e ${leanMass} quilos de massa magra`}>
      <span className={styles.fatMassPart} style={{ width: `${Math.max(0, Math.min(100, fatMass! / totalMass * 100))}%` }} />
      <span className={styles.leanMassPart} style={{ width: `${Math.max(0, Math.min(100, leanMass! / totalMass * 100))}%` }} />
    </div>}
  </section>;
}
