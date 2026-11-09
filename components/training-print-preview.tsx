'use client';
import { useEffect, useRef, useState } from 'react';
import type { TrainingPlan } from '@/lib/training-plans';
import { renderTrainingPrint } from '@/lib/training-print';
import styles from './assessments.module.css';

export function TrainingPrintPreview({plan,onClose}:{plan:TrainingPlan;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const frame=useRef<HTMLIFrameElement>(null);
  const close=useRef(onClose);close.current=onClose;
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const modal=dialog.current!,iframe=frame.current!;
    const controller=new AbortController();
    const overflow=document.body.style.overflow;
    const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
    document.body.style.overflow='hidden';modal.showModal();
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close.current();}};
    setError('');setLoading(true);
    void renderTrainingPrint(plan,iframe,controller.signal).then(()=>{
      if(!controller.signal.aborted){setLoading(false);iframe.contentDocument?.addEventListener('keydown',escape);}
    }).catch(()=>{
      if(!controller.signal.aborted){setLoading(false);setError('Não foi possível preparar a ficha. Feche esta prévia e tente novamente.');}
    });
    return()=>{controller.abort();iframe.contentDocument?.removeEventListener('keydown',escape);modal.close();document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus({preventScroll:true});};
  },[plan]);
  return <dialog ref={dialog} className={styles.printDialog} aria-label="Prévia da ficha · meia folha A4" onCancel={event=>{event.preventDefault();onClose();}}>
    <div className={styles.printDialogHeader}><strong>Ficha de treino · meia folha A4</strong><button type="button" className={styles.secondary} onClick={onClose} autoFocus>Fechar prévia</button></div>
    {loading&&<p className={styles.note} role="status">Preparando a ficha para impressão…</p>}
    {error&&<p className={styles.notice} role="alert">{error}</p>}
    <iframe ref={frame} title="Ficha de treino para impressão" className={styles.printFrame}/>
  </dialog>;
}
