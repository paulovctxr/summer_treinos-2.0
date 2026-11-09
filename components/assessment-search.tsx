'use client';
import { useState, type ReactNode } from 'react';
import { instructorKey } from '@/lib/assessment-folders';
import { displayDate, type AssessmentSummary } from '@/lib/assessments';
import styles from './assessments.module.css';

export function AssessmentSearch({items,busy,onOpen,children}:{items:AssessmentSummary[];busy:boolean;onOpen:(a:AssessmentSummary)=>void;children:ReactNode}){
  const [query,setQuery]=useState('');const [page,setPage]=useState(0);
  const terms=instructorKey(query).split(' ').filter(Boolean);
  const results=terms.length?items.filter(a=>terms.every(term=>instructorKey(`${a.student_name} ${a.registration}`).includes(term))):[];
  return <section><div className={styles.search}><label>Buscar aluno em todas as pastas<input type="search" value={query} maxLength={120} placeholder="Nome ou matrícula do aluno" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>{query&&<button className={styles.secondary} onClick={()=>{setQuery('');setPage(0);}}>Limpar busca</button>}</div>
    {terms.length?<><p role="status">{results.length} {results.length===1?'avaliação encontrada':'avaliações encontradas'} em todas as pastas de professores.</p>
      {!results.length?<div className={styles.empty}>Nenhuma avaliação encontrada. Confira o nome ou a matrícula. Avaliações removidas ficam na Lixeira.</div>:<div className={styles.list}>{results.slice(page*30,page*30+30).map(a=><button key={a.id} className={styles.listCard} disabled={busy} onClick={()=>{setQuery('');setPage(0);onOpen(a);}}><span className={styles.badge}>{a.status==='published'?'Publicada':'Rascunho'}</span><h3>{a.student_name||'Aluno a confirmar'}</h3><p>Matrícula {a.registration||'pendente'} · {displayDate(a.assessed_on)}</p><p>Pasta: <strong>{a.instructor||'Sem professor'}</strong></p><strong>Abrir avaliação →</strong></button>)}</div>}
      <div className={styles.toolbar}>{page>0&&<button className={styles.secondary} onClick={()=>setPage(page-1)}>Resultados anteriores</button>}{(page+1)*30<results.length&&<button className={styles.secondary} onClick={()=>setPage(page+1)}>Mais resultados</button>}</div>
    </>:children}
  </section>;
}
