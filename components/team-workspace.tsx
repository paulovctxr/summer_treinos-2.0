'use client';
import { useState } from 'react';
import { ClipboardList, Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Assessment } from '@/lib/assessments';
import { newTraining, type TrainingPlan } from '@/lib/training-plans';
import { AssessmentWorkspace } from './assessment-workspace';
import { TrainingWorkspace } from './training-workspace';
import styles from './assessments.module.css';
export function TeamWorkspace({isAdmin=false}:{isAdmin?:boolean}){
  const [tab,setTab]=useState<'assessments'|'training'>('assessments');const [visited,setVisited]=useState(false);const [seed,setSeed]=useState<TrainingPlan|null>(null);const [trainingDirty,setTrainingDirty]=useState(false);const [error,setError]=useState('');const [trainingBusy,setTrainingBusy]=useState(false);
  function create(a:Assessment){if(trainingBusy){setError('Aguarde o salvamento do treino antes de começar outra ficha.');return;}if(trainingDirty&&!confirm('Há alterações não salvas no treino aberto. Descartá-las e começar o treino deste aluno?'))return;setSeed(newTraining(a));setVisited(true);setTab('training');}
  return <div className={styles.shell}><header className={styles.top}><strong>Área da equipe</strong><div className={styles.toolbar}>{isAdmin&&<a className={styles.secondary} href="/admin">← Voltar à administração</a>}<button className={styles.secondary} disabled={trainingBusy} onClick={async()=>{if(!confirm('Sair da conta da equipe? Confira se seus rascunhos estão salvos.'))return;const {error}=await createClient().auth.signOut({scope:'local'});if(error)setError('Não foi possível sair. Tente novamente.');else window.location.assign('/professor');}}>Sair da conta</button></div></header>
    <nav className={styles.teamTabs} aria-label="Área da equipe"><button disabled={trainingBusy} aria-pressed={tab==='assessments'} onClick={()=>setTab('assessments')}><ClipboardList size={19}/>Avaliações</button><button disabled={trainingBusy} aria-pressed={tab==='training'} onClick={()=>{setVisited(true);setTab('training');}}><Dumbbell size={19}/>Treinos</button></nav>
    {error&&<p role="alert" className={styles.notice}>{error}</p>}
    <div hidden={tab!=='assessments'}><AssessmentWorkspace teacher embedded onCreateTraining={create}/></div>
    {visited&&<div hidden={tab!=='training'}><TrainingWorkspace seed={seed} onDirty={setTrainingDirty} onBusy={setTrainingBusy}/></div>}
  </div>;
}
