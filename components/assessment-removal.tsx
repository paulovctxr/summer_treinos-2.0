'use client';
import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useModalDialog } from '@/lib/use-modal-dialog';
import { displayDate, type AssessmentSummary } from '@/lib/assessments';
import { instructorKey } from '@/lib/assessment-folders';
import styles from './assessments.module.css';

export type AssessmentRemovalTarget = { kind:'assessment'|'folder'; name:string; records:AssessmentSummary[] };
export function AssessmentRemoval({target,onClose,onRemoved,onRefresh}:{target:AssessmentRemovalTarget;onClose:()=>void;onRemoved:(count:number)=>void;onRefresh:()=>void}) {
  const [confirmation,setConfirmation]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [stale,setStale]=useState(false);
  const dialog=useModalDialog(onClose,!busy);const isFolder=target.kind==='folder';
  const label=isFolder?(target.name||'Sem professor'):target.records[0].student_name||'Aluno a confirmar';
  const published=target.records.filter(a=>a.status==='published').length;
  const valid=!isFolder || instructorKey(confirmation)===instructorKey(label);
  async function remove(){
    if(busy||!valid||stale)return;setBusy(true);setError('');
    try {
      const {data,error}=isFolder
        ? await createClient().rpc('summer_assessment_remove_folder',{p_instructor:target.name,p_expected:target.records.map(a=>({id:a.id,revision:a.revision}))})
        : await createClient().rpc('summer_assessment_remove',{p_id:target.records[0].id,p_revision:target.records[0].revision});
      if(error){
        if(error.code==='40001'){setStale(true);throw new Error('As avaliações mudaram em outro acesso ou já foram removidas. Atualize a lista e confira novamente.');}
        if(error.code==='PGRST202')throw new Error('A remoção ainda precisa ser ativada pela administração no banco de dados.');
        throw new Error('Não foi possível remover. Tente novamente.');
      }
      if(!data || typeof data.removed!=='number')throw new Error('Não foi possível confirmar a remoção. Atualize a lista.');
      onRemoved(data.removed);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível remover.');}finally{setBusy(false);}
  }
  return <div className={styles.modalOverlay}>
    <section ref={dialog} className={styles.removalDialog} role="dialog" aria-modal="true" aria-labelledby="remove-title" aria-describedby="remove-description" aria-busy={busy}>
      <div className={styles.removalHeading}><h2 id="remove-title">{isFolder?'Remover pasta do professor?':'Remover avaliação?'}</h2><button className={styles.closeDialog} disabled={busy} onClick={onClose} aria-label="Fechar confirmação"><X size={20}/></button></div>
      <p><strong>{label}</strong></p>
      <p id="remove-description">{isFolder?`${target.records.length===1?'Será removida 1 avaliação':`Serão removidas ${target.records.length} avaliações`} desta pasta. ${published===0?'Nenhuma está publicada para os alunos.':`${published} ${published===1?'já está publicada':'já estão publicadas'} para os alunos.`}`:`Avaliação de ${displayDate(target.records[0].assessed_on)} · Matrícula ${target.records[0].registration||'não informada'}.`}</p>
      <p>As avaliações removidas deixarão de aparecer para a equipe e para os alunos. Não será possível desfazer por esta tela.</p>
      {isFolder && <label className={styles.removalConfirmation}>Para confirmar, digite “{label}”<input value={confirmation} maxLength={120} autoComplete="off" disabled={busy} onChange={e=>setConfirmation(e.target.value)}/></label>}
      {error && <p className={styles.notice} role="alert">{error}</p>}
      <div className={styles.toolbar}><button className={styles.secondary} disabled={busy} onClick={onClose}>Cancelar</button>{stale?<button className={styles.secondary} onClick={()=>{onClose();onRefresh();}}>Atualizar lista</button>:<button className={styles.primary} disabled={busy||!valid} onClick={()=>void remove()}><Trash2 size={16}/>{busy?'Removendo…':isFolder?'Remover pasta e avaliações':'Confirmar remoção'}</button>}</div>
    </section>
  </div>;
}
