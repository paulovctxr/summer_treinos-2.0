'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Minus, Plus, UsersRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AssessmentStudent } from '@/lib/assessments';
import {
  ACTIVITY_LABELS, MOVEMENT_HOURS, STATUS_LABELS, addDays, dateInSaoPaulo,
  displayScheduleDate, movementSummary, newScheduleEntry, scheduleIssues, weekDates,
  weekStart, type MovementCount, type ScheduleEntry, type ScheduleStatus,
} from '@/lib/team-schedule';
import shared from './assessments.module.css';
import styles from './team-schedule.module.css';
import { ExcelDownload } from './excel-download';

type Section = 'agenda' | 'movement';
type CountMap = Record<string, MovementCount>;
const countKey = (date: string, hour: number) => `${date}:${hour}`;
const timeLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export function TeamScheduleWorkspace({ onBusy, onDirty }: { onBusy?: (busy: boolean) => void; onDirty?: (dirty: boolean) => void }) {
  const today = dateInSaoPaulo();
  const [section, setSection] = useState<Section>('agenda');
  const [start, setStart] = useState(() => weekStart(today));
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [counts, setCounts] = useState<CountMap>({});
  const [dirtyCounts, setDirtyCounts] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<ScheduleEntry | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [candidate, setCandidate] = useState<AssessmentStudent | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dates = useMemo(() => weekDates(start), [start]);
  const end = dates[6];

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const client = createClient();
      const [agenda, movement] = await Promise.all([
        client.rpc('summer_team_schedule_list', { p_start: start, p_end: addDays(start, 6) }),
        client.rpc('summer_gym_movement_list', { p_start: start, p_end: addDays(start, 6) }),
      ]);
      if (agenda.error) throw agenda.error;
      if (movement.error) throw movement.error;
      setEntries((agenda.data || []) as ScheduleEntry[]);
      setCounts(Object.fromEntries(((movement.data || []) as MovementCount[]).map(item => [countKey(item.counted_on, item.counted_hour), item])));
      setDirtyCounts(new Set());
    } catch (reason) {
      const unavailable = typeof reason === 'object' && reason && 'code' in reason && reason.code === 'PGRST202';
      setError(unavailable ? 'A agenda precisa ser ativada no banco antes do primeiro uso.' : 'Não foi possível carregar a agenda. Confira a conexão e tente novamente.');
    } finally { setLoading(false); }
  }, [start]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onBusy?.(busy); }, [busy, onBusy]);
  useEffect(() => { onDirty?.(editorDirty || dirtyCounts.size > 0); }, [dirtyCounts, editorDirty, onDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (editorDirty || dirtyCounts.size) event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCounts, editorDirty]);

  function moveWeek(days: number) {
    if ((editorDirty || dirtyCounts.size) && !confirm('Há alterações não salvas. Descartar e mudar de semana?')) return;
    setEditor(null); setEditorDirty(false); setCandidate(null); setMessage(''); setStart(addDays(start, days));
  }
  function changeEditor(patch: Partial<ScheduleEntry>) {
    setEditor(current => current ? { ...current, ...patch } : null); setEditorDirty(true); setMessage('');
  }
  function openNew(date = today) {
    if (editorDirty && !confirm('Descartar o agendamento ainda não salvo?')) return;
    setEditor(newScheduleEntry(date)); setEditorDirty(true); setCandidate(null); setError(''); setMessage('Novo agendamento');
  }
  function openEntry(entry: ScheduleEntry) {
    if (editorDirty && !confirm('Descartar o agendamento ainda não salvo?')) return;
    setEditor({ ...entry, scheduled_time: entry.scheduled_time.slice(0, 5) }); setEditorDirty(false); setCandidate(null); setError(''); setMessage('');
  }
  function closeEditor() {
    if (editorDirty && !confirm('Descartar as alterações deste agendamento?')) return;
    setEditor(null); setEditorDirty(false); setCandidate(null); setMessage('');
  }
  async function findStudent() {
    if (!editor || !/^\d{4}$/.test(editor.registration)) { setError('Informe os quatro números da matrícula.'); return; }
    setBusy(true); setError(''); setCandidate(null);
    try {
      const { data, error: lookupError } = await createClient().rpc('summer_assessment_find_student', { p_registration: editor.registration });
      if (lookupError) throw lookupError;
      setCandidate(data as AssessmentStudent | null);
      if (!data) setError('Aluno não encontrado. Você ainda pode agendar pelo nome e vincular depois.');
    } catch { setError('Não foi possível consultar a matrícula.'); } finally { setBusy(false); }
  }
  async function saveEntry(record = editor) {
    if (!record || busy) return;
    const issues = scheduleIssues(record); if (issues.length) { setError(issues.join(' ')); return; }
    setBusy(true); setError('');
    try {
      const { data, error: saveError } = await createClient().rpc('summer_team_schedule_save', { p_record: record, p_revision: record.revision });
      if (saveError) throw saveError;
      const saved = data as ScheduleEntry;
      setEntries(current => [...current.filter(item => item.id !== saved.id), saved].sort((a, b) => `${a.scheduled_on}${a.scheduled_time}`.localeCompare(`${b.scheduled_on}${b.scheduled_time}`)));
      if (editor?.id === saved.id) { setEditor(saved); setEditorDirty(false); }
      setMessage('Agendamento salvo.');
    } catch (reason) {
      const conflict = typeof reason === 'object' && reason && 'code' in reason && reason.code === '40001';
      setError(conflict ? 'Este agendamento mudou em outro computador. Atualize a agenda.' : 'Não foi possível salvar o agendamento.');
    } finally { setBusy(false); }
  }
  async function mark(entry: ScheduleEntry, status: ScheduleStatus) {
    await saveEntry({ ...entry, status });
  }
  async function removeEntry() {
    if (!editor || busy || !confirm(`Remover o agendamento de ${editor.student_name}?`)) return;
    setBusy(true); setError('');
    try {
      const { error: removeError } = await createClient().rpc('summer_team_schedule_remove', { p_id: editor.id, p_revision: editor.revision });
      if (removeError) throw removeError;
      setEntries(current => current.filter(item => item.id !== editor.id)); setEditor(null); setEditorDirty(false); setMessage('Agendamento removido.');
    } catch { setError('Não foi possível remover. Atualize a agenda e tente novamente.'); } finally { setBusy(false); }
  }

  function setCount(date: string, hour: number, value: number) {
    const key = countKey(date, hour); const previous = counts[key];
    setCounts(current => ({ ...current, [key]: { counted_on: date, counted_hour: hour, people_count: Math.max(0, Math.min(500, value || 0)), revision: previous?.revision || 0, updated_at: previous?.updated_at || '' } }));
    setDirtyCounts(current => new Set(current).add(key)); setMessage('');
  }
  async function saveCounts() {
    if (!dirtyCounts.size || busy) return;
    setBusy(true); setError('');
    try {
      const client = createClient(); const saved: MovementCount[] = [];
      for (const key of dirtyCounts) {
        const item = counts[key]; if (!item) continue;
        const { data, error: saveError } = await client.rpc('summer_gym_movement_save', { p_counted_on: item.counted_on, p_counted_hour: item.counted_hour, p_people_count: item.people_count, p_revision: item.revision });
        if (saveError) throw saveError; saved.push(data as MovementCount);
      }
      setCounts(current => ({ ...current, ...Object.fromEntries(saved.map(item => [countKey(item.counted_on, item.counted_hour), item])) }));
      setDirtyCounts(new Set()); setMessage('Contagem da semana salva.');
    } catch (reason) {
      const conflict = typeof reason === 'object' && reason && 'code' in reason && reason.code === '40001';
      setError(conflict ? 'Uma contagem mudou em outro computador. Atualize antes de continuar.' : 'Não foi possível salvar toda a contagem. Atualize a tela e confira os valores.');
    } finally { setBusy(false); }
  }

  const weekCounts = Object.values(counts).filter(item => dates.includes(item.counted_on));
  const summary = movementSummary(weekCounts);

  return <main className={shared.embedded}>
    <div className={shared.heading}><div><p className={shared.eyebrow}>ORGANIZAÇÃO DA EQUIPE</p><h1>Agenda e movimento</h1><p>Agende atendimentos e acompanhe o movimento da musculação sem depender das planilhas.</p></div><div className={shared.toolbar}><ExcelDownload disabled={busy} onBusyChange={setBusy} createFile={async () => { const { createTeamScheduleExcelFile } = await import('@/lib/team-schedule-excel'); return createTeamScheduleExcelFile(entries, Object.values(counts), start); }}/>{section === 'agenda' && !editor && <button className={shared.primary} disabled={busy} onClick={() => openNew()}>+ Novo agendamento</button>}</div></div>
    <nav className={styles.sectionTabs} aria-label="Agenda e movimento"><button aria-pressed={section === 'agenda'} onClick={() => setSection('agenda')}><CalendarDays size={18}/>Agenda</button><button aria-pressed={section === 'movement'} onClick={() => setSection('movement')}><UsersRound size={18}/>Contagem da musculação</button></nav>
    {error && <p className={shared.notice} role="alert">{error} <button className={shared.secondary} onClick={() => void load()}>Atualizar</button></p>}
    {message && <p className={shared.confirm} role="status">{message}</p>}
    <div className={styles.weekNavigation}><button aria-label="Semana anterior" className={shared.secondary} disabled={busy} onClick={() => moveWeek(-7)}><ChevronLeft size={18}/></button><label>Semana de<input type="date" value={start} onChange={event => { const next = weekStart(event.target.value); if (next) setStart(next); }}/></label><strong>{displayScheduleDate(start)} — {displayScheduleDate(end, true)}</strong><button aria-label="Próxima semana" className={shared.secondary} disabled={busy} onClick={() => moveWeek(7)}><ChevronRight size={18}/></button><button className={shared.secondary} disabled={busy} onClick={() => setStart(weekStart(today))}>Hoje</button></div>

    {section === 'agenda' && <>
      {editor && <section className={styles.editor} aria-label="Editar agendamento"><div className={styles.editorHeading}><div><span className={shared.eyebrow}>{editor.revision ? 'EDITAR AGENDAMENTO' : 'NOVO AGENDAMENTO'}</span><h2>{editor.student_name || 'Aluno a informar'}</h2></div><button className={styles.iconButton} aria-label="Fechar edição" onClick={closeEditor}><X/></button></div>
        <div className={shared.search}><label>Matrícula do aluno<input inputMode="numeric" maxLength={4} value={editor.registration} onChange={event => { changeEditor({ registration: event.target.value.replace(/\D/g, ''), student_id: null }); setCandidate(null); }}/></label><button className={shared.secondary} disabled={busy} onClick={() => void findStudent()}>Localizar aluno</button></div>
        {candidate && <div className={shared.confirm}><strong>{candidate.name} · {candidate.registration}</strong><button className={shared.secondary} onClick={() => { changeEditor({ student_id: candidate.id, student_name: candidate.name }); setCandidate(null); }}>Confirmar este aluno</button></div>}
        {editor.student_id && <p className={shared.confirm}>Aluno confirmado: {editor.student_name} · {editor.registration}</p>}
        <div className={shared.grid}><label>Nome do aluno<input maxLength={120} readOnly={!!editor.student_id} value={editor.student_name} onChange={event => changeEditor({ student_name: event.target.value })}/></label><label>Professor responsável<input maxLength={120} value={editor.instructor} onChange={event => changeEditor({ instructor: event.target.value })}/></label><label>Data<input type="date" value={editor.scheduled_on} onChange={event => changeEditor({ scheduled_on: event.target.value })}/></label><label>Horário<input type="time" value={editor.scheduled_time.slice(0, 5)} onChange={event => changeEditor({ scheduled_time: event.target.value })}/></label><label>Atividade<select value={editor.activity} onChange={event => changeEditor({ activity: event.target.value as ScheduleEntry['activity'] })}>{Object.entries(ACTIVITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Situação<select value={editor.status} onChange={event => changeEditor({ status: event.target.value as ScheduleStatus })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className={shared.wide}>Observações<textarea rows={3} maxLength={500} value={editor.notes} placeholder="Ex.: montar treino B ou atendimento único" onChange={event => changeEditor({ notes: event.target.value })}/></label></div>
        <div className={shared.toolbar}><button className={shared.primary} disabled={busy} onClick={() => void saveEntry()}>{busy ? 'Salvando…' : 'Salvar agendamento'}</button>{editor.revision > 0 && <button className={styles.deleteButton} disabled={busy} onClick={() => void removeEntry()}>Remover</button>}</div>
      </section>}
      {loading ? <p role="status">Carregando agenda…</p> : <div className={styles.agendaGrid}>{dates.map(date => { const dayEntries = entries.filter(entry => entry.scheduled_on === date); return <section className={`${styles.dayColumn} ${date === today ? styles.today : ''}`} key={date}><header><strong>{displayScheduleDate(date)}</strong><button aria-label={`Novo agendamento em ${displayScheduleDate(date, true)}`} onClick={() => openNew(date)}><Plus size={17}/></button></header><div className={styles.dayEntries}>{!dayEntries.length && <p>Livre</p>}{dayEntries.map(entry => <article className={`${styles.entry} ${styles[entry.status]}`} key={entry.id}><button className={styles.entryMain} onClick={() => openEntry(entry)}><time>{entry.scheduled_time.slice(0, 5)}</time><strong>{entry.student_name}</strong><span>{entry.registration || 'Sem matrícula'}</span><small>{ACTIVITY_LABELS[entry.activity]} · {entry.instructor}</small>{entry.notes && <small>{entry.notes}</small>}</button><div className={styles.quickActions}><button aria-label={`Marcar presença de ${entry.student_name}`} title="Compareceu" disabled={busy || entry.status === 'attended'} onClick={() => void mark(entry, 'attended')}><Check size={16}/></button><button aria-label={`Marcar falta de ${entry.student_name}`} title="Faltou" disabled={busy || entry.status === 'missed'} onClick={() => void mark(entry, 'missed')}><X size={16}/></button></div></article>)}</div></section>; })}</div>}
      <div className={styles.legend}><span><i className={styles.attendedDot}/>Compareceu</span><span><i className={styles.missedDot}/>Faltou</span><span><i className={styles.scheduledDot}/>Agendado</span><span><i className={styles.cancelledDot}/>Cancelado</span></div>
    </>}

    {section === 'movement' && <>
      <div className={styles.summary}><div><span>Total registrado na semana</span><strong>{summary.total}</strong></div><div><span>Média por horário preenchido</span><strong>{summary.average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong></div><div><span>Maior movimento</span><strong>{summary.peak ? summary.peak.people_count : '—'}</strong><small>{summary.peak ? `${displayScheduleDate(summary.peak.counted_on)} às ${timeLabel(summary.peak.counted_hour)}` : 'Preencha a contagem'}</small></div></div>
      <p className={styles.help}>Conte quantas pessoas estão na musculação em cada horário. Os valores substituem a planilha “Contagem musculação”.</p>
      {loading ? <p role="status">Carregando contagem…</p> : <>
        <div className={styles.movementTableWrap}><table className={styles.movementTable}><thead><tr><th>Hora</th>{dates.map(date => <th key={date}>{displayScheduleDate(date)}</th>)}</tr></thead><tbody>{MOVEMENT_HOURS.map(hour => <tr key={hour}><th>{timeLabel(hour)}</th>{dates.map(date => { const key = countKey(date, hour); return <td key={key}><input aria-label={`${displayScheduleDate(date, true)} às ${timeLabel(hour)}`} type="number" min={0} max={500} value={counts[key]?.people_count ?? ''} placeholder="—" onChange={event => setCount(date, hour, Number(event.target.value))}/></td>; })}</tr>)}</tbody></table></div>
        <div className={styles.movementMobile}>{dates.map(date => <details key={date} open={date === today}><summary>{displayScheduleDate(date, true)}<strong>{MOVEMENT_HOURS.reduce((sum, hour) => sum + (counts[countKey(date, hour)]?.people_count || 0), 0)} no dia</strong></summary><div>{MOVEMENT_HOURS.map(hour => { const key = countKey(date, hour); const value = counts[key]?.people_count || 0; return <label key={key}><span>{timeLabel(hour)}</span><button aria-label={`Diminuir contagem das ${timeLabel(hour)}`} onClick={() => setCount(date, hour, value - 1)}><Minus size={16}/></button><input aria-label={`Pessoas às ${timeLabel(hour)}`} type="number" min={0} max={500} value={counts[key]?.people_count ?? ''} placeholder="0" onChange={event => setCount(date, hour, Number(event.target.value))}/><button aria-label={`Aumentar contagem das ${timeLabel(hour)}`} onClick={() => setCount(date, hour, value + 1)}><Plus size={16}/></button></label>; })}</div></details>)}</div>
        <div className={styles.saveBar}><span>{dirtyCounts.size ? `${dirtyCounts.size} ${dirtyCounts.size === 1 ? 'valor alterado' : 'valores alterados'}` : 'Contagem atualizada'}</span><button className={shared.primary} disabled={busy || !dirtyCounts.size} onClick={() => void saveCounts()}>{busy ? 'Salvando…' : 'Salvar contagem'}</button></div>
      </>}
    </>}
  </main>;
}
