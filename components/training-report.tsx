import { trainingLabel, type TrainingPlan } from '@/lib/training-plans';
import type { Workout } from '@/lib/fitness';
import { displayDate } from '@/lib/assessments';
import { ExerciseDemonstration } from './exercise-demonstration';
import styles from './assessments.module.css';
export function TrainingReport({plan,onStart,disabled=false}:{plan:TrainingPlan;onStart?:(workout:Workout)=>void;disabled?:boolean}){
  return <section className={styles.report}><header className={styles.reportHeader}><span className={styles.badge}>{plan.status==='draft'?'Rascunho · ainda não entregue':'Ficha publicada'}</span><h2>{trainingLabel(plan)}</h2><p>{plan.student_name||'Aluno a confirmar'} · Matrícula {plan.registration||'pendente'}<br/>Professor: {plan.instructor||'não informado'}</p>{plan.published_at&&<p>Publicada em {new Date(plan.published_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>}</header>
    <dl className={styles.values}>{plan.objective&&<div><dt>Objetivo</dt><dd>{plan.objective}</dd></div>}{plan.target_zone&&<div><dt>Zona alvo</dt><dd>{plan.target_zone}</dd></div>}{plan.starts_on&&<div><dt>Data da ficha</dt><dd>{displayDate(plan.starts_on)}</dd></div>}{plan.reviewed_on&&<div><dt>Revisão</dt><dd>{displayDate(plan.reviewed_on)}</dd></div>}{plan.reassess_on&&<div><dt>Reavaliação</dt><dd>{displayDate(plan.reassess_on)}</dd></div>}</dl>
    {plan.workouts.map(w=><section key={w.id} className={styles.trainingBlock}><div className={styles.toolbar}><div><h3>{w.title}</h3><p>{w.focus} · {w.minutes} min</p></div>{onStart&&<button className={styles.primary} disabled={disabled} onClick={()=>onStart(w)}>Iniciar {w.title}</button>}</div>
      <ol className={styles.prescriptionList}>{w.exercises.map(e=><li key={e.id}><strong>{e.name||'Exercício sem nome'}</strong><p>{e.sets||'—'} séries · {e.reps||'Repetições não informadas'}{e.weight!==undefined?` · ${e.weight} ${e.weightUnit||'kg'}`:''}{e.restSeconds!==undefined?` · Descanso: ${e.restSeconds}s`:''}</p>{e.notes&&<p className={styles.trainingNotes}>{e.notes}</p>}<ExerciseDemonstration name={e.name}/></li>)}</ol>
    </section>)}
  </section>;
}
