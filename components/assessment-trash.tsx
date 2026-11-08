'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { displayDate } from '@/lib/assessments';
import { instructorKey } from '@/lib/assessment-folders';
import styles from './assessments.module.css';
type Removed={id:string;removed_at:string;student_name:string;registration:string;instructor:string;assessed_on:string;status:string};
export function AssessmentTrash({onClose,onRestored}:{onClose:()=>void;onRestored:()=>void}) {
  const [items,setItems]=useState<Removed[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const all:Removed[]=[];for(let offset=0;offset<=100000;offset+=30){const {data,error}=await createClient().rpc('summer_assessment_trash',{p_offset:offset});if(error)throw error;all.push(...data);if(data.length<30)break;}setItems(all);}
    catch{setError('Não foi possível carregar a lixeira. Confira a conexão e se a atualização foi ativada pela administração.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function restore(records:Removed[]){
    const published=records.filter(a=>a.status==='published').length;
    if(!window.confirm(`Recuperar ${records.length===1?'esta avaliação':`estas ${records.length} avaliações`}? ${published===1?'A avaliação publicada voltará a aparecer para o aluno.':published>1?`As ${published} avaliações publicadas voltarão a aparecer para os alunos.`:'Os rascunhos continuarão visíveis somente para a equipe.'}`))return;
    setBusy(true);setError('');setMessage('');
    try{const {data,error}=await createClient().rpc('summer_assessment_restore',{p_items:records.map(({id,removed_at})=>({id,removed_at}))});
      if(error)throw new Error(error.code==='40001'?'A lixeira mudou em outro acesso. Atualize a lista e confira novamente.':'Não foi possível recuperar. Confira se o cadastro do aluno ainda existe ou consulte a administração.');
      setMessage(`${data.restored} ${data.restored===1?'avaliação recuperada':'avaliações recuperadas'}. A pasta do professor foi recomposta.`);onRestored();await load();
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível recuperar.');}finally{setBusy(false);}
  }
  const groups=[...new Set(items.map(a=>instructorKey(a.instructor)))];
  return <section><div className={styles.toolbar}><button className={styles.secondary} disabled={busy} onClick={onClose}>← Voltar às avaliações</button><h2>Lixeira de avaliações</h2></div>
    <p>Recupere uma ficha ou todas as avaliações removidas de um professor. Publicações recuperadas voltam para a conta do aluno.</p>
    {message&&<p className={styles.confirm} role="status">{message}</p>}{error&&<p className={styles.notice} role="alert">{error}<button className={styles.secondary} disabled={busy} onClick={()=>void load()}>Atualizar lista</button></p>}
    {loading?<p role="status">Carregando lixeira…</p>:!error&&!items.length?<div className={styles.empty}>A lixeira está vazia.</div>:groups.map(key=>{const records=items.filter(a=>instructorKey(a.instructor)===key);return <section className={styles.card} key={key}><div className={styles.toolbar}><h3>{records[0].instructor||'Sem professor'}</h3><button className={styles.secondary} disabled={busy} onClick={()=>void restore(records)}>Recuperar pasta ({records.length})</button></div>
      <div className={styles.list}>{records.map(a=><article className={styles.listCard} key={a.id}><span className={styles.badge}>{a.status==='published'?'Publicada':'Rascunho'}</span><h3>{a.student_name||'Aluno a confirmar'}</h3><p>Matrícula {a.registration||'pendente'} · Avaliação de {displayDate(a.assessed_on)}</p><p>Removida em {new Date(a.removed_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p><button className={styles.secondary} disabled={busy} onClick={()=>void restore([a])}>Recuperar avaliação</button></article>)}</div>
    </section>;})}
  </section>;
}
