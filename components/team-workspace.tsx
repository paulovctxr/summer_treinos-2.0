'use client';
import { useState } from 'react';
import { CalendarDays, ClipboardList, Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Assessment } from '@/lib/assessments';
import { newTraining, type TrainingPlan } from '@/lib/training-plans';
import { AssessmentWorkspace } from './assessment-workspace';
import { TrainingWorkspace } from './training-workspace';
import { TeamScheduleWorkspace } from './team-schedule-workspace';
import styles from './assessments.module.css';
export function TeamWorkspace({isAdmin=false}:{isAdmin?:boolean}){
  const [tab,setTab]=useState<'assessments'|'training'|'schedule'>('assessments');const [visited,setVisited]=useState(false);const [scheduleVisited,setScheduleVisited]=useState(false);const [seed,setSeed]=useState<TrainingPlan|null>(null);const [trainingDirty,setTrainingDirty]=useState(false);const [scheduleDirty,setScheduleDirty]=useState(false);const [error,setError]=useState('');const [trainingBusy,setTrainingBusy]=useState(false);const [scheduleBusy,setScheduleBusy]=useState(false);
  const workspaceBusy=trainingBusy||scheduleBusy;
  function selectTab(next:'assessments'|'training'|'schedule'){if(tab==='schedule'&&scheduleDirty&&!confirm('Há alterações não salvas na agenda. Descartar e mudar de área?'))return;if(next==='training')setVisited(true);if(next==='schedule')setScheduleVisited(true);setTab(next);}
  function create(a:Assessment){if(trainingBusy){setError('Aguarde o salvamento do treino antes de começar outra ficha.');return;}if(trainingDirty&&!confirm('Há alterações não salvas no treino aberto. Descartá-las e começar o treino deste aluno?'))return;setSeed(newTraining(a));setVisited(true);setTab('training');}
  return <div className={styles.shell}><header className={styles.top}><strong>Área da equipe</strong><div className={styles.toolbar}>{isAdmin&&<a className={styles.secondary} href="/admin">← Voltar à administração</a>}<button className={styles.secondary} disabled={workspaceBusy} onClick={async()=>{if(!confirm('Sair da conta da equipe? Confira se seus rascunhos estão salvos.'))return;const {error}=await createClient().auth.signOut({scope:'local'});if(error)setError('Não foi possível sair. Tente novamente.');else window.location.assign('/professor');}}>Sair da conta</button></div></header>
    <nav className={styles.teamTabs} aria-label="Área da equipe"><button disabled={workspaceBusy} aria-pressed={tab==='assessments'} onClick={()=>selectTab('assessments')}><ClipboardList size={19}/>Avaliações</button><button disabled={workspaceBusy} aria-pressed={tab==='training'} onClick={()=>selectTab('training')}><Dumbbell size={19}/>Treinos</button><button disabled={workspaceBusy} aria-pressed={tab==='schedule'} onClick={()=>selectTab('schedule')}><CalendarDays size={19}/>Agenda</button></nav>
    {error&&<p role="alert" className={styles.notice}>{error}</p>}
    <div hidden={tab!=='assessments'}><AssessmentWorkspace teacher embedded onCreateTraining={create}/></div>
    {visited&&<div hidden={tab!=='training'}><TrainingWorkspace seed={seed} onDirty={setTrainingDirty} onBusy={setTrainingBusy}/></div>}
    {scheduleVisited&&<div hidden={tab!=='schedule'}><TeamScheduleWorkspace onDirty={setScheduleDirty} onBusy={setScheduleBusy}/></div>}
  </div>;
}
