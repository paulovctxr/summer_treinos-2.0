'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { displayDate } from '@/lib/assessments';
import styles from './assessments.module.css';
type Point={date:string;weight:string|null;body_fat:string|null;abdomen:string|null};
const metrics={weight:{label:'Peso',unit:'kg'},body_fat:{label:'Gordura corporal',unit:'%'},abdomen:{label:'Abdome',unit:'cm'}};
export function AssessmentEvolution({studentId}:{studentId:string|null}){
  const [points,setPoints]=useState<Point[]>([]);const [metric,setMetric]=useState<keyof typeof metrics>('weight');const [error,setError]=useState(false);
  useEffect(()=>{let active=true;setPoints([]);setError(false);void createClient().rpc('summer_assessment_evolution',{p_student_id:studentId}).then(({data,error})=>{if(active){setError(!!error);setPoints(error?[]:data||[]);}});return()=>{active=false;};},[studentId]);
  if(error)return <p className={styles.note}>Não foi possível carregar o gráfico de evolução.</p>;
  if(points.length<2)return null;
  const available=points.filter(p=>p[metric] && Number.isFinite(Number(p[metric])));const values=available.map(p=>Number(p[metric]));
  const min=Math.min(...values),max=Math.max(...values);const delta=values.length>1?values.at(-1)!-values[0]:null;
  const coords=values.map((value,i)=>`${24+i*552/Math.max(1,values.length-1)},${130-(value-min)*100/(max-min||1)}`);
  return <section className={styles.card}><h2>Evolução nas avaliações</h2><p className={styles.note}>Até 24 avaliações publicadas. As diferenças mostram mudanças nas medidas, sem classificar o resultado como bom ou ruim.</p>
    <div className={styles.steps} aria-label="Medida do gráfico">{Object.entries(metrics).map(([key,value])=><button key={key} className={metric===key?styles.selectedStep:''} aria-pressed={metric===key} onClick={()=>setMetric(key as keyof typeof metrics)}>{value.label}</button>)}</div>
    {values.length<2?<p>São necessárias duas medidas de {metrics[metric].label.toLowerCase()} para comparar.</p>:<>
      <p><strong>{delta!>0?'+':''}{delta!.toLocaleString('pt-BR',{maximumFractionDigits:2})} {metric==='body_fat'?'p.p.':metrics[metric].unit}</strong> entre {displayDate(available[0].date)} e {displayDate(available.at(-1)!.date)}.</p>
      <svg className={styles.chart} viewBox="0 0 600 155" role="img" aria-label={`Evolução de ${metrics[metric].label}. Valores detalhados abaixo.`}><line x1="24" y1="140" x2="576" y2="140" stroke="#ddd"/><polyline points={coords.join(' ')} fill="none" stroke="#bd1425" strokeWidth="3"/>{coords.map((xy,i)=>{const [x,y]=xy.split(',');return <circle key={i} cx={x} cy={y} r="5" fill="#bd1425"/>;})}</svg>
      <details className={styles.section}><summary>Ver datas e valores</summary><dl className={styles.values}>{available.map((p,i)=><div key={i}><dt>{displayDate(p.date)}</dt><dd>{Number(p[metric]).toLocaleString('pt-BR')} {metrics[metric].unit}</dd></div>)}</dl></details>
    </>}
  </section>;
}
