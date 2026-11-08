'use client';
import { useEffect, useState } from 'react';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './home-assessment-link.module.css';

export function HomeAssessmentLink() {
  const [unread,setUnread]=useState(0);
  useEffect(()=>{
    let active=true;let running=false;
    const refresh=async()=>{if(running||document.hidden)return;running=true;try{const {data,error}=await createClient().rpc('summer_assessment_notice');if(active&&!error)setUnread(data?.unread||0);}catch{}finally{running=false;}};
    void refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    const timer=window.setInterval(refresh,60000);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  return <a className={styles.card} href="/avaliacoes">
    <span className={styles.icon}><ClipboardList size={25} aria-hidden="true" /></span>
    <span className={styles.copy}><strong>{unread>0?'Nova avaliação disponível':'Minha avaliação física'}</strong><span aria-live="polite">{unread>0?`${unread} ${unread===1?'avaliação ainda não visualizada. Seu professor já publicou os resultados.':'avaliações ainda não visualizadas. Confira os resultados do professor.'}`:'Consulte suas medidas, orientações do professor e avaliações anteriores.'}</span></span>
    <span className={styles.action}>Ver avaliação <ArrowRight size={18} aria-hidden="true" /></span>
  </a>;
}
