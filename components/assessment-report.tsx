'use client';
import { ASSESSMENT_SECTIONS, displayDate, type Assessment } from '@/lib/assessments';
import { BodyFatChart } from './body-fat-chart';
import styles from './assessments.module.css';
export function AssessmentReport({ assessment: a, previous }: { assessment: Assessment; previous?: Assessment | null }) {
  const highlights = [{ key:'weight',label:'Peso',unit:'kg' },{ key:'height',label:'Altura',unit:'cm' },{ key:'body_fat',label:'Gordura corporal',unit:'%' },{ key:'lean_mass',label:'Massa magra',unit:'kg' }];
  return <article className={styles.report}>
    <header className={styles.reportHeader}><p className={styles.eyebrow}>SUMMER FIT · AVALIAÇÃO FÍSICA</p><h2>{a.student_name || 'Avaliação em preenchimento'}</h2>
      <p>{displayDate(a.assessed_on)} · Professor: {a.instructor || 'Não informado'}</p>
      <p>Matrícula: {a.registration || 'Não informada'} · Reavaliação: {displayDate(a.reassess_on)}</p>
      {a.status === 'draft' && <span className={styles.badge}>Prévia de rascunho · ainda não enviada</span>}
    </header>
    <div className={styles.metrics}>{highlights.map(f => {
      const current=a.data[f.key]; const old=previous?.data[f.key];
      const delta=current && old ? Number(current)-Number(old) : null;
      return <div key={f.key}><span>{f.label}</span><strong>{current ? Number(current).toLocaleString('pt-BR') : '—'} <small>{current ? f.unit : ''}</small></strong>
        {delta!==null && Number.isFinite(delta) && <small>{delta>0?'+':''}{delta.toLocaleString('pt-BR',{maximumFractionDigits:2})} {f.key==='body_fat'?'p.p.':f.unit} desde {displayDate(previous!.assessed_on)}</small>}
      </div>;
    })}</div>
    <BodyFatChart data={a.data} model={a.model} assessedOn={a.assessed_on} showEmpty={false} />
    <p className={styles.note}>Resultados e orientações registrados pelo professor. Campos sem preenchimento aparecem como “Não informado”.</p>
    {ASSESSMENT_SECTIONS.map(section => <details className={styles.section} key={section.title} open={section.title === 'Orientações do professor'}>
      <summary>{section.title}</summary><dl className={styles.values}>{section.fields.map(f => <div key={f.key}><dt>{f.label}</dt><dd>{a.data[f.key] ? f.type==='date' ? displayDate(a.data[f.key]) : `${a.data[f.key]}${f.unit ? ` ${f.unit}`:''}` : 'Não informado'}</dd></div>)}</dl>
    </details>)}
  </article>;
}
