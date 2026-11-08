'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ASSESSMENT_SECTIONS, assessmentIssues, displayDate, localDate, newAssessment, type Assessment, type AssessmentSummary, type AssessmentStudent } from '@/lib/assessments';
import { AssessmentReport } from './assessment-report';
import { AssessmentEvolution } from './assessment-evolution';
import { AssessmentFolders } from './assessment-folders';
import { allAssessmentSummaries } from '@/lib/assessment-folders';
import { AssessmentRemoval, type AssessmentRemovalTarget } from './assessment-removal';
import { AssessmentTrash } from './assessment-trash';
import styles from './assessments.module.css';

export function AssessmentWorkspace({ teacher = false, embedded = false, onCreateTraining }: { teacher?: boolean; embedded?: boolean; onCreateTraining?:(assessment:Assessment)=>void }) {
  const [items,setItems]=useState<AssessmentSummary[]>([]); const [loading,setLoading]=useState(true);
  const [error,setError]=useState(''); const [offset,setOffset]=useState(0);
  const [selected,setSelected]=useState<Assessment | null>(null); const [previous,setPrevious]=useState<Assessment | null>(null);
  const [busy,setBusy]=useState(false); const [editing,setEditing]=useState(false);
  const [folder,setFolder]=useState<string|null>(null);
  const [removal,setRemoval]=useState<AssessmentRemovalTarget|null>(null);
  const [feedback,setFeedback]=useState('');
  const [trash,setTrash]=useState(false);
  const requestVersion=useRef(0);
  const load=useCallback(async () => {
    const version=++requestVersion.current;
    setLoading(true); setError('');
    try {
      const readPage=async(pageOffset:number)=>{const {data,error}=await createClient().rpc('summer_assessment_list',{p_offset:pageOffset,p_search:''});if(error)throw error;return (data||[]) as AssessmentSummary[];};
      const next=teacher?await allAssessmentSummaries(readPage,()=>version===requestVersion.current):await readPage(offset);
      if(version===requestVersion.current)setItems(next);
    }
    catch { if(version===requestVersion.current)setError('Não foi possível carregar as avaliações. Tente novamente; se persistir, consulte a administração.'); }
    finally { if(version===requestVersion.current)setLoading(false); }
  },[offset,teacher]);
  useEffect(()=>{void load();return()=>{requestVersion.current++;};},[load]);
  async function open(item:AssessmentSummary) {
    setBusy(true); setError(''); setPrevious(null);
    try {
      const {data,error}=await createClient().rpc('summer_assessment_get',{p_id:item.id}); if(error) throw error;
      setSelected(data); setEditing(teacher && data.status==='draft');
      if(!teacher){const seen=await createClient().rpc('summer_assessment_seen',{p_id:item.id});if(!seen.error){setSelected({...data,viewed_at:seen.data});setItems(current=>current.map(a=>a.id===item.id?{...a,viewed_at:seen.data}:a));}}
      const older=items.find(other=>other.student_id===item.student_id && other.status==='published' && other.assessed_on<item.assessed_on);
      if(older) { const result=await createClient().rpc('summer_assessment_get',{p_id:older.id}); if(!result.error) setPrevious(result.data); }
    } catch { setError('Não foi possível abrir esta avaliação.'); } finally { setBusy(false); }
  }
  async function download(a:Assessment) {
    setBusy(true);setError('');
    try { const {downloadAssessmentExcel}=await import('@/lib/assessment-excel'); await downloadAssessmentExcel(a); }
    catch { setError('Não foi possível gerar o Excel. Tente novamente.'); } finally {setBusy(false);}
  }
  const back=()=>{setSelected(null);setEditing(false);setPrevious(null);void load();};
  const start=(instructor:string)=>{setFolder(instructor);setSelected({...newAssessment(),instructor});setEditing(true);setPrevious(null);};
  return <main className={embedded?styles.embedded:styles.shell}>
{!embedded && <header className={styles.top}>{selected && editing ? <strong>Avaliação em andamento</strong> : <>{teacher?<strong>Área de avaliações</strong>:<a href="/">← Summer Treinos</a>}<button className={styles.secondary} onClick={async()=>{const {error}=await createClient().auth.signOut({scope:'local'}); if(error){setError('Não foi possível sair. Tente novamente.');return;} window.location.assign(teacher?'/professor':'/');}}>Sair da conta</button></>}</header>}
    <div className={styles.heading}><div><p className={styles.eyebrow}>{teacher?'ESPAÇO DA EQUIPE':'SEU ACOMPANHAMENTO'}</p><h1>{teacher?'Avaliações físicas':'Minhas avaliações'}</h1><p>{teacher?'Avalie, acompanhe e entregue os resultados ao aluno.':'Suas medidas, orientações e evolução em um só lugar.'}</p></div>
    </div>
    {error && <div className={styles.notice} role="alert">{error}<button className={styles.secondary} onClick={()=>void load()}>Tentar novamente</button></div>}
    {feedback && <p className={styles.confirm} role="status">{feedback}</p>}
    {teacher&&!selected&&!trash&&<div className={styles.toolbar}><button className={styles.secondary} onClick={()=>{setTrash(true);setFeedback('');}}>Lixeira</button></div>}
    {teacher&&trash?<AssessmentTrash onClose={()=>setTrash(false)} onRestored={()=>void load()}/>:<>
    {selected ? editing ? <AssessmentEditor initial={selected} onClose={a=>{setFolder(a.instructor);back();}} onPublished={a=>{setSelected(a);setFolder(a.instructor);setEditing(false);void load();}} /> : <>
      <div className={styles.toolbar}><button className={styles.secondary} disabled={busy} onClick={back}>{teacher?'← Pasta do professor':'← Todas as avaliações'}</button><button className={styles.primary} disabled={busy} onClick={()=>void download(selected)}>Baixar Excel (.xlsx)</button>
        {teacher && <button className={styles.secondary} onClick={()=>{const next=newAssessment();setSelected({...next,student_id:selected.student_id,student_name:selected.student_name,registration:selected.registration,model:selected.model,instructor:selected.instructor});setEditing(true);setPrevious(null);}}>Nova reavaliação</button>}
        {teacher && <button className={styles.removeButton} disabled={busy} onClick={()=>{setFeedback('');setRemoval({kind:'assessment',name:selected.student_name,records:[selected]});}}>Remover avaliação</button>}
        {teacher&&selected.student_id&&onCreateTraining&&<button className={styles.primary} disabled={busy} onClick={()=>onCreateTraining(selected)}>Montar treino para este aluno</button>}
        {teacher&&selected.status==='published'&&<p className={styles.note}>{selected.viewed_at?`Visualizada pelo aluno em ${new Date(selected.viewed_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}`:'Ainda não visualizada pelo aluno'}</p>}
      </div><AssessmentReport assessment={selected} previous={previous} />
      {selected.student_id && <AssessmentEvolution studentId={selected.student_id} />}
    </> : teacher ? loading ? <p role="status">Organizando as pastas dos professores…</p> : !error && <AssessmentFolders items={items} folder={folder} onFolder={setFolder} onOpen={item=>void open(item)} onNew={start} onRemove={target=>{setFeedback('');setRemoval(target);}} busy={busy}/> : <>
      {loading ? <p role="status">Carregando avaliações…</p> : !items.length && !error ? <section className={styles.empty}><h2>Sua avaliação aparecerá aqui</h2><p>Depois da avaliação na academia, o professor publicará os resultados na sua conta. Não é necessário contratar o Pro para consultar.</p></section> :
        <div className={styles.list}>{items.map(a=><button className={styles.listCard} key={a.id} disabled={busy} onClick={()=>void open(a)}>
          <span className={styles.badge}>{a.status==='published'?'Publicada':'Rascunho'}</span><h2>Avaliação de {displayDate(a.assessed_on)}</h2>
          {!a.viewed_at&&<span className={styles.badge}>Nova · ainda não visualizada</span>}
          <p>Professor: {a.instructor}</p>
          <span>Ver avaliação →</span>
        </button>)}</div>}
      <div className={styles.toolbar}>{offset>0 && <button className={styles.secondary} disabled={loading} onClick={()=>setOffset(Math.max(0,offset-30))}>Anteriores</button>}{items.length===30 && <button className={styles.secondary} disabled={loading} onClick={()=>setOffset(offset+30)}>Mais avaliações</button>}</div>
    </>}
    </>}
    {teacher && removal && <AssessmentRemoval target={removal} onClose={()=>setRemoval(null)} onRefresh={()=>void load()} onRemoved={count=>{
      if(removal.kind==='folder')setFolder(null);
      setRemoval(null);setSelected(null);setEditing(false);setPrevious(null);
      setFeedback(`${count} ${count===1?'avaliação removida':'avaliações removidas'}.`);void load();
    }}/>}
  </main>;
}

function AssessmentEditor({initial,onClose,onPublished}:{initial:Assessment;onClose:(a:Assessment)=>void;onPublished:(a:Assessment)=>void}) {
  const [record,setRecord]=useState(initial);const current=useRef(initial);
  const lastSaved=useRef(initial);
  const [step,setStep]=useState(0);const [preview,setPreview]=useState(false);const [saveMessage,setSaveMessage]=useState(initial.revision?'Rascunho salvo':'Novo rascunho');
  const [errors,setErrors]=useState<string[]>([]);const [busy,setBusy]=useState(false);const [finding,setFinding]=useState(false);
  const [candidate,setCandidate]=useState<AssessmentStudent | null>(null);const [lookupMessage,setLookupMessage]=useState('');
  const generation=useRef(0);const savedGeneration=useRef(0);const saving=useRef(false);const mounted=useRef(true);const conflict=useRef(false);
  const [downloading,setDownloading]=useState(false);const [publishing,setPublishing]=useState(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  function update(patch:Partial<Assessment>) {
    generation.current++;current.current={...current.current,...patch};setRecord(current.current);setSaveMessage('Alterações ainda não salvas');
  }
  const save=useCallback(async(publish=false):Promise<Assessment | null>=>{
    if(saving.current || conflict.current) return null;
    const snapshot=current.current;const version=generation.current;
    const issues=assessmentIssues(snapshot,publish);if(issues.length){setErrors(issues);setSaveMessage('Revise os campos para salvar');return null;}
    saving.current=true;setBusy(true);setErrors([]);setSaveMessage(publish?'Publicando…':'Salvando…');
    try {
      const {data,error}=await createClient().rpc('summer_assessment_save',{p_record:snapshot,p_revision:snapshot.revision,p_publish:publish});
      if(error) {
        if(error.code==='40001' || error.message.includes('Outra pessoa') || error.message.includes('preservada')) conflict.current=true;
        throw new Error(conflict.current?'Este rascunho foi alterado ou removido em outro acesso. Baixe seu Excel antes de sair e atualize a lista para conferir.':error.message.includes('matrícula')?'A matrícula mudou. Localize e confirme o aluno novamente.':'Não foi possível salvar. Confira a conexão e toque em Salvar rascunho.');
      }
      if(!mounted.current) return null;
      savedGeneration.current=version;
      lastSaved.current=data;
      current.current={...current.current,revision:data.revision,updated_at:data.updated_at,status:data.status,published_at:data.published_at};
      setRecord(current.current);setSaveMessage(version===generation.current?`Salvo às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:'Há alterações para salvar');
      return data;
    }catch(e){if(mounted.current){setErrors([e instanceof Error?e.message:'Não foi possível salvar.']);setSaveMessage('Alterações não salvas');}return null;}
    finally{saving.current=false;if(mounted.current)setBusy(false);}
  },[]);
  useEffect(()=>{
    if(generation.current===savedGeneration.current || conflict.current) return;
    const timer=window.setTimeout(()=>void save(),1200);return()=>window.clearTimeout(timer);
  },[record,save]);
  useEffect(()=>{
    const warn=(e:BeforeUnloadEvent)=>{if(generation.current!==savedGeneration.current || saving.current){e.preventDefault();}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[]);
  async function findStudent(){
    const registration=current.current.registration;
    if(!/^\d{4}$/.test(registration)){setLookupMessage('Informe os quatro números da matrícula.');return;}
    setFinding(true);setCandidate(null);setLookupMessage('');
    try {
      const {data,error}=await createClient().rpc('summer_assessment_find_student',{p_registration:registration});if(error)throw error;
      if(current.current.registration!==registration)return;
      setCandidate(data);if(!data)setLookupMessage('Cadastro confirmado não encontrado. Salve como rascunho e vincule depois que o aluno se cadastrar.');
    }catch{setLookupMessage('Não foi possível consultar. Tente novamente.');}finally{setFinding(false);}
  }
  function close(){
    if(saving.current)return;
    if(generation.current!==savedGeneration.current && !confirm('Há alterações não salvas. Sair e descartá-las?'))return;
    onClose(lastSaved.current);
  }
  async function publish(){
    if(!confirm(`Publicar esta avaliação para ${current.current.student_name}, matrícula ${current.current.registration}? Depois de publicada, ela será preservada no histórico.`))return;
    setPublishing(true);const result=await save(true);setPublishing(false);if(result)onPublished(result);
  }
  async function download(){
    const issues=assessmentIssues(current.current);if(issues.length){setErrors(issues);return;}
    setDownloading(true);try{const {downloadAssessmentExcel}=await import('@/lib/assessment-excel');await downloadAssessmentExcel(current.current);}catch{setErrors(['Não foi possível baixar o Excel. Tente novamente.']);}finally{setDownloading(false);}
  }
  const titles=['Identificação',...ASSESSMENT_SECTIONS.map(s=>s.title)];
  return <section className={styles.editor}>
    <div className={styles.toolbar}><button className={styles.secondary} disabled={busy} onClick={close}>← Pasta do professor</button><span className={styles.saveStatus} role="status">{saveMessage}</span></div>
    {errors.length>0 && <div role="alert" className={styles.notice}><strong>Confira antes de continuar</strong><ul>{errors.map((error,i)=><li key={i}>{error}</li>)}</ul></div>}
    <nav className={styles.steps} aria-label="Etapas da avaliação">{titles.map((title,i)=><button key={title} className={step===i&&!preview?styles.selectedStep:''} aria-current={step===i&&!preview?'step':undefined} onClick={()=>{setStep(i);setPreview(false);}}>{i+1}. {title}</button>)}</nav>
    {preview ? <AssessmentReport assessment={record} /> : <fieldset className={styles.formCard} disabled={publishing}>
      <legend>{titles[step]}</legend>
      {step===0 ? <>
        <p className={styles.note}>Confirme o aluno pela matrícula antes de publicar. O rascunho pode ser preenchido antes do cadastro.</p>
        <div className={styles.search}><label>Matrícula do aluno<input inputMode="numeric" maxLength={4} value={record.registration} onChange={e=>{update({registration:e.target.value.replace(/\D/g,''),student_id:null});setCandidate(null);setLookupMessage('');}} /></label><button type="button" className={styles.secondary} disabled={finding} onClick={()=>void findStudent()}>{finding?'Buscando…':'Localizar aluno'}</button></div>
        {candidate && !record.student_id && <div className={styles.confirm}><p><strong>{candidate.name}</strong> · Matrícula {candidate.registration}</p><button className={styles.primary} onClick={()=>{update({student_id:candidate.id,student_name:candidate.name});setCandidate(null);}}>Confirmar este aluno</button></div>}
        {lookupMessage && <p role="status">{lookupMessage}</p>}{record.student_id && <p className={styles.confirm}>✓ Aluno confirmado: {record.student_name} · {record.registration}</p>}
        <div className={styles.grid}>
          <label>Nome do aluno<input value={record.student_name} readOnly={!!record.student_id} maxLength={120} onChange={e=>update({student_name:e.target.value})} /></label>
          <label>Professor responsável<input value={record.instructor} maxLength={120} placeholder="Quem realizou esta avaliação?" onChange={e=>update({instructor:e.target.value})} /></label>
          <label>Data da avaliação<input type="date" value={record.assessed_on} max={localDate()} onChange={e=>update({assessed_on:e.target.value})} /></label>
          <label>Previsão de reavaliação<input type="date" value={record.reassess_on || ''} min={record.assessed_on} onChange={e=>update({reassess_on:e.target.value || null})} /></label>
          <label>Modelo de referência<select value={record.model} onChange={e=>update({model:e.target.value as Assessment['model']})}><option value="HOMENS">Homens</option><option value="MULHERES">Mulheres</option></select></label>
        </div>
      </> : <><p className={styles.note}>Preencha somente o que foi avaliado. Resultados de protocolos devem ser conferidos e informados pelo professor.</p><div className={styles.grid}>{ASSESSMENT_SECTIONS[step-1].fields.map(f=><label key={f.key} className={f.type==='text'?styles.wide:''}>{f.label}{f.unit?` (${f.unit})`:''}
        {f.type==='text'?<textarea rows={3} maxLength={2000} value={record.data[f.key] || ''} onChange={e=>update({data:{...record.data,[f.key]:e.target.value}})} />:
          <input type={f.type==='date'?'date':'number'} inputMode={f.type==='number'?'decimal':undefined} step={f.type==='number'?'any':undefined} min={f.type==='date'?'1900-01-01':f.min} max={f.type==='date'?record.assessed_on:f.max} value={record.data[f.key] || ''} placeholder="Não informado" onChange={e=>update({data:{...record.data,[f.key]:e.target.value}})} />}
      </label>)}</div></>}
    </fieldset>}
    <div className={styles.toolbar}>
      {step>0 && !preview && <button className={styles.secondary} onClick={()=>setStep(step-1)}>← Etapa anterior</button>}
      {step<titles.length-1 && !preview && <button className={styles.primary} onClick={()=>setStep(step+1)}>Próxima etapa →</button>}
      <button className={styles.secondary} onClick={()=>setPreview(!preview)}>{preview?'Voltar ao preenchimento':'Visualizar como aluno'}</button>
    </div>
    <div className={styles.bottom}><button className={styles.secondary} disabled={busy||conflict.current} onClick={()=>void save()}>Salvar rascunho</button><button className={styles.secondary} disabled={downloading} onClick={()=>void download()}>{downloading?'Gerando Excel…':'Baixar Excel (.xlsx)'}</button><button className={styles.primary} disabled={busy||publishing||conflict.current} onClick={()=>void publish()}>Publicar para o aluno</button></div>
    <p className={styles.note}>O Excel é uma cópia editável. Salve o arquivo na pasta do professor no computador; alterações feitas nele não modificam a avaliação publicada no site.</p>
  </section>;
}
