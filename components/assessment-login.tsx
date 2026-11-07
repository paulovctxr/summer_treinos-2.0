'use client';
import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './assessments.module.css';

export function AssessmentLogin({ restricted = false }: { restricted?: boolean }) {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: String(form.get('email')).trim(), password: String(form.get('password')) });
      if (error) { setMessage('Não foi possível entrar. Confira o e-mail e a senha da equipe.'); return; }
      window.location.assign('/professor');
    } catch { setMessage('Não foi possível conectar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <main className={styles.shell}><section className={styles.login}>
    <img src="/summer-fit-brand.jpeg" alt="Summer Fit" width="200" />
    <p className={styles.eyebrow}>ÁREA DE AVALIAÇÕES</p><h1>Acesso da equipe</h1>
    {restricted ? <><p>Esta conta não tem acesso à área do professor.</p><button className={styles.primary} onClick={async () => { const {error}=await createClient().auth.signOut({scope:'local'}); if(error){setMessage('Não foi possível sair. Tente novamente.');return;} window.location.assign('/professor'); }}>Entrar com a conta da equipe</button></> : <>
      <p>Use o e-mail e a senha compartilhados pela academia.</p>
      <form onSubmit={submit} className={styles.fields}>
        <label>E-mail da equipe<input name="email" type="email" autoComplete="username" required /></label>
        <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className={styles.primary} disabled={busy}>{busy ? 'Entrando…' : 'Entrar nas avaliações'}</button>
      </form>
      <a href="/?recuperar=1">Recuperar senha pelo acesso principal</a>
    </>}
    {message && <p role="alert">{message}</p>}<a href="/">Voltar ao aplicativo</a>
  </section></main>;
}
