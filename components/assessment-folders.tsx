'use client';
import { useState } from 'react';
import { Folder, FolderOpen, Plus, ChevronRight, Trash2 } from 'lucide-react';
import type { AssessmentRemovalTarget } from './assessment-removal';
import { assessmentFolders, instructorKey } from '@/lib/assessment-folders';
import { displayDate, type AssessmentSummary } from '@/lib/assessments';
import styles from './assessments.module.css';

export function AssessmentFolders({items,folder,onFolder,onOpen,onNew,onRemove,busy}:{
  items:AssessmentSummary[];folder:string|null;onFolder:(name:string|null)=>void;
  onOpen:(item:AssessmentSummary)=>void;onNew:(name:string)=>void;onRemove:(target:AssessmentRemovalTarget)=>void;busy:boolean;
}) {
  const [adding,setAdding]=useState(false);const [name,setName]=useState('');
  const [search,setSearch]=useState('');const [status,setStatus]=useState('all');const [page,setPage]=useState(0);
  const folders=assessmentFolders(items);
  const current=folders.find(f=>f.key===instructorKey(folder||''));
  const visible=items.filter(a=>instructorKey(a.instructor)===instructorKey(folder||'') && (status==='all'||a.status===status) && (instructorKey(a.student_name).includes(instructorKey(search)) || a.registration.includes(search.trim())));
  function select(name:string|null){onFolder(name);setPage(0);setSearch('');setStatus('all');setAdding(false);}
  return <section>
    <div className={styles.folderHeading}>
      {folder===null ? <div><h2>Pastas dos professores</h2><p>Abra sua pasta para continuar uma avaliação ou registrar uma nova.</p></div> : <div><button className={styles.secondary} onClick={()=>select(null)}>← Pastas dos professores</button><h2>{current?.name || folder || 'Sem professor'}</h2><p>{folder ? 'Avaliações registradas com este professor responsável.' : 'Abra estes rascunhos e preencha o professor responsável para organizá-los na pasta correta.'}</p></div>}
      {folder===null ? <button className={styles.primary} onClick={()=>setAdding(!adding)}><Plus size={18}/>Novo professor</button> : folder && <button className={styles.primary} onClick={()=>onNew(current?.name||folder)}><Plus size={18}/>Nova avaliação</button>}
    </div>
    {adding && <form className={`${styles.card} ${styles.fields}`} onSubmit={e=>{e.preventDefault();const clean=name.trim().replace(/\s+/g,' ');if(!clean)return;const existing=folders.find(f=>f.key===instructorKey(clean));if(existing){select(existing.name);}else{onNew(clean);}setName('');}}>
      <label>Nome completo do professor<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} autoComplete="off" placeholder="Ex.: Maria Oliveira" /></label>
      <p className={styles.note}>A pasta ficará salva no site junto com a primeira avaliação. Não é necessário criar outra conta.</p>
      <div className={styles.toolbar}><button className={styles.primary}>Começar primeira avaliação</button><button type="button" className={styles.secondary} onClick={()=>setAdding(false)}>Cancelar</button></div>
    </form>}
    {folder===null ? <>
      {!folders.length && <div className={styles.empty}><h3>Organize suas avaliações por professor</h3><p>Toque em Novo professor para começar a primeira ficha.</p></div>}
      <div className={styles.folders}>{folders.map(f=><article className={styles.manageableCard} key={f.key}><button className={styles.folderCard} disabled={busy} onClick={()=>select(f.name)}>
        <span className={styles.folderIcon}><Folder size={32} aria-hidden="true"/></span>
        <h3>{f.name || 'Sem professor'}</h3><strong>{f.total} {f.total===1?'avaliação':'avaliações'}</strong>
        <p>{f.drafts} {f.drafts===1?'rascunho':'rascunhos'} · {f.published} {f.published===1?'publicada':'publicadas'}</p>
        <span className={styles.folderOpen}>Abrir pasta <ChevronRight size={17}/></span>
      </button><button className={styles.removeButton} disabled={busy} aria-label={`Remover pasta ${f.name||'Sem professor'}`} onClick={()=>onRemove({kind:'folder',name:f.name,records:items.filter(a=>instructorKey(a.instructor)===f.key)})}><Trash2 size={16}/>Remover pasta</button></article>)}</div>
    </> : <>
      <div className={styles.folderFilters}><label>Buscar aluno nesta pasta<input value={search} maxLength={120} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Nome ou matrícula" /></label>
        <label>Situação<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">Todas</option><option value="draft">Rascunhos</option><option value="published">Publicadas</option></select></label></div>
      {!visible.length ? <div className={styles.empty}><FolderOpen size={30}/><h3>Nenhuma avaliação encontrada nesta pasta</h3><p>Confira os filtros ou comece uma nova avaliação.</p></div> : <div className={styles.list}>{visible.slice(page*30,page*30+30).map(a=><article className={styles.manageableCard} key={a.id}><button className={styles.listCard} disabled={busy} onClick={()=>onOpen(a)}>
        <span className={styles.badge}>{a.status==='published'?'Publicada':'Rascunho'}</span><h3>{a.student_name||'Aluno a confirmar'}</h3><p>{displayDate(a.assessed_on)} · Matrícula {a.registration||'pendente'}</p><span>{a.status==='draft'?'Continuar preenchimento':'Ver avaliação'} →</span>
      </button><button className={styles.removeButton} disabled={busy} aria-label={`Remover avaliação de ${a.student_name||'Aluno a confirmar'} de ${displayDate(a.assessed_on)}`} onClick={()=>onRemove({kind:'assessment',name:a.student_name,records:[a]})}><Trash2 size={16}/>Remover avaliação</button></article>)}</div>}
      <div className={styles.toolbar}>{page>0 && <button className={styles.secondary} onClick={()=>setPage(page-1)}>Anteriores</button>}{(page+1)*30<visible.length && <button className={styles.secondary} onClick={()=>setPage(page+1)}>Mais avaliações</button>}</div>
    </>}
  </section>;
}
