'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TrainingPlan, TrainingSummary } from '@/lib/training-plans';
import type { Workout } from '@/lib/fitness';
import { TrainingReport } from './training-report';
import styles from './assessments.module.css';
export function StudentTrainingInbox({onStart,disabled}:{onStart:(workout:Workout)=>void;disabled:boolean}){
  const [items,setItems]=useState<TrainingSummary[]>([]);const [selected,setSelected]=useState<TrainingPlan|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [offset,setOffset]=useState(0);const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);setError('');try{const {data,error}=await createClient().rpc('summer_training_list',{p_offset:offset});if(error){if(error.code==='PGRST202'){setItems([]);return;}throw error;}setItems(data||[]);}catch{setError('Não foi possível consultar as fichas do professor.');}finally{setLoading(false);}},[offset]);
  useEffect(()=>{void load();const refresh=()=>{if(!document.hidden)void load();};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[load]);
  async function open(id:string){setBusy(true);setError('');try{const {data,error}=await createClient().rpc('summer_training_get',{p_id:id});if(error)throw error;setSelected(data);}catch{setError('Não foi possível abrir esta ficha. Tente novamente.');}finally{setBusy(false);}}
  if(!loading&&!items.length&&!selected&&!error&&offset===0)return null;
  return <section className={styles.card} aria-label="Treinos enviados pelo professor"><div className={styles.toolbar}><div><p className={styles.eyebrow}>DA ACADEMIA PARA VOCÊ</p><h2>Fichas do professor</h2></div>{selected&&<button className={styles.secondary} onClick={()=>setSelected(null)}>Ver outras fichas</button>}</div>
    {error&&<p role="alert" className={styles.notice}>{error}<button className={styles.secondary} disabled={busy} onClick={()=>void load()}>Tentar novamente</button></p>}
    {selected?<TrainingReport plan={selected} onStart={onStart} disabled={disabled||busy}/>:loading?<p role="status">Consultando fichas…</p>:<><p>Abra a ficha indicada pelo professor e inicie o treino. As versões anteriores continuam disponíveis para consulta.</p><div className={styles.list}>{items.map((a,i)=><button className={styles.listCard} key={a.id} disabled={busy} onClick={()=>void open(a.id)}><span className={styles.badge}>{offset===0&&i===0?'Mais recente':'Publicada'}</span><h3>{a.title}</h3><p>Professor: {a.instructor}</p><p>{a.published_at?new Date(a.published_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):''}</p><strong>Ver e iniciar treino →</strong></button>)}</div><div className={styles.toolbar}>{offset>0&&<button className={styles.secondary} onClick={()=>setOffset(offset-30)}>Anteriores</button>}{items.length===30&&<button className={styles.secondary} onClick={()=>setOffset(offset+30)}>Mais fichas</button>}</div></>}
  </section>;
}
