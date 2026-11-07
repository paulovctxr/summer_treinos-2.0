'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './assessments.module.css';
export function AdminAssessmentAccount() {
  const [email, setEmail] = useState<string | null>(null); const [ready, setReady] = useState(false);
  const [busy,setBusy] = useState(false); const [message,setMessage] = useState('');
  useEffect(() => { void createClient().rpc('summer_admin_assessment_account').then(({ data,error }) => { if (error) setMessage('A área de avaliações aguarda ativação no banco.'); else { setEmail(data?.email || null); setReady(true); } }); },[]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/avaliacoes/conta', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ email: values.get('email'), password: values.get('password') }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setEmail(result.email); form.reset(); setMessage('Conta da equipe criada. Compartilhe o acesso somente com os professores da academia.');
    } catch(e) { setMessage(e instanceof Error ? e.message : 'Falha ao criar conta.'); } finally { setBusy(false); }
  }
  async function revoke() {
    if (!confirm('Desativar o acesso compartilhado às avaliações? As avaliações salvas serão preservadas.')) return;
    setBusy(true);
    try { const { error } = await createClient().rpc('summer_admin_assessment_account', { p_user_id:null,p_change:true }); if(error) throw error; setEmail(null); setMessage('Acesso desativado.'); }
    catch { setMessage('Não foi possível desativar. Tente novamente.'); } finally { setBusy(false); }
  }
  return <section className={styles.card}>
    <h2>Avaliações físicas</h2><p>Uma conta exclusiva e compartilhada para a equipe avaliar alunos, sem acesso à administração.</p>
    <div className={styles.toolbar}><a className={styles.primary} href="/professor">Abrir área de avaliações</a></div>
    <details><summary>Configurar acesso da equipe</summary>
      {email ? <><p>Conta ativa: <strong>{email}</strong></p><button disabled={busy} className={styles.secondary} onClick={revoke}>Desativar acesso da equipe</button></> :
        <form className={styles.fields} onSubmit={create}>
          <label>E-mail exclusivo da equipe<input name="email" type="email" autoComplete="off" required /></label>
          <label>Senha compartilhada (mínimo 12 caracteres)<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label>
          <button className={styles.primary} disabled={!ready || busy}>{busy ? 'Criando…' : 'Criar conta de avaliações'}</button>
        </form>}
    </details>{message && <p role="status">{message}</p>}
  </section>;
}
