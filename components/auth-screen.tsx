'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { ArrowRight, CircleCheck, CircleHelp, Dumbbell, Eye, EyeOff, IdCard, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { InstallApp } from '@/components/install-app'
import styles from './auth-screen.module.css'
import { REFERRAL_STORAGE_KEY, referralCode } from '@/lib/referrals'

type Mode = 'login' | 'signup' | 'reset'
export function AuthScreen({ initialMessage = '' }: { initialMessage?: string }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [registration, setRegistration] = useState('')
  const [message, setMessage] = useState(initialMessage)
  const [messageKind, setMessageKind] = useState<'error' | 'success'>('error')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [referral, setReferral] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    if (search.get('cadastro') === '1') setMode('signup')
    const query = referralCode(search.get('ref'))
    let stored: string | null = null
    try { stored = referralCode(window.localStorage.getItem(REFERRAL_STORAGE_KEY)) } catch {}
    const next = query || stored
    if (!next) return
    setReferral(next)
    try { window.localStorage.setItem(REFERRAL_STORAGE_KEY, next) } catch {}
  }, [])
  function switchMode(next: Mode) {
    setMode(next); setMessage(''); setPassword(''); setVisible(false); setCapsLock(false)
    // Announce the new form without opening the mobile keyboard automatically.
    requestAnimationFrame(() => headingRef.current?.focus())
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setLoading(true); setMessage(''); setMessageKind('error')
    try {
      const supabase = createClient()
      const normalizedEmail = email.trim().toLowerCase()
      const callback = `${window.location.origin}/auth/callback`
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${callback}?next=/auth/reset-password` })
        if (error) throw error
        setMessageKind('success')
        setMessage('Se houver uma conta com esse e-mail, você receberá um link para criar outra senha. Confira também o spam.')
        return
      }
      const { data, error } = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        : await supabase.auth.signUp({ email: normalizedEmail, password, options: { emailRedirectTo: callback, data: { name: name.trim(), matricula: registration, ...(referral ? { referral_code: referral } : {}) } } })
      if (error) {
        setMessage(error.code === 'email_not_confirmed' ? 'Confirme seu e-mail antes de entrar. Confira também a pasta de spam.' : error.code === 'invalid_credentials' ? 'E-mail ou senha incorretos. Você pode recuperar sua senha abaixo.' : error.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' : 'Não foi possível concluir. Confira os dados e tente novamente em instantes.')
        return
      }
      if (mode === 'signup' && !data.session) {
        setMessageKind('success')
        setMessage('Confira seu e-mail para confirmar o cadastro. Depois da confirmação, você já poderá entrar normalmente.')
      }
      if (data.session && referral) {
        const attached = await supabase.rpc('summer_attach_referral', { p_code: referral })
        if (!attached.error) try { window.localStorage.removeItem(REFERRAL_STORAGE_KEY) } catch {}
      }
    } catch { setMessage('Não foi possível conectar ao serviço de acesso. Confira sua conexão e tente novamente.') }
    finally { setLoading(false) }
  }
  return <main className="auth-shell auth-shell-branded">
    <InstallApp />
    <section className="auth-brand-panel" aria-label="Summer Fit">
      <img className="auth-brand-logo" src="/summer-fit-brand.jpeg" alt="Summer Fit — A academia que vai esquentar o seu dia" />
      <div className="auth-brand-copy">
        <p className="auth-brand-kicker">TREINE · REGISTRE · EVOLUA</p>
        <h2>Seu treino da academia, agora no celular.</h2>
        <p>Digitalize sua ficha, acompanhe suas cargas e veja sua evolução em um só lugar.</p>
        <div className="auth-benefits" aria-label="Recursos principais">
          <span>Ficha por foto</span>
          <span>Cronômetro</span>
          <span>Histórico</span>
        </div>
      </div>
      <img className="auth-brand-mascot" src="/summer-fit-mascot.jpeg" alt="" aria-hidden="true" />
    </section>
    <section className={`auth-card ${styles.card}`} aria-labelledby="auth-title">
      <div className="auth-logo">
        <img className="auth-academy-logo" src="/summer-fit-brand.jpeg" alt="Summer Fit" width={280} height={78} />
      </div>
      <div className="auth-heading"><div className="auth-icon"><Dumbbell size={22} aria-hidden="true" /></div><p className="eyebrow">UM TREINO DE CADA VEZ</p><h1 id="auth-title" ref={headingRef} tabIndex={-1}>{mode === 'login' ? 'Seu próximo passo começa aqui.' : mode === 'signup' ? 'Vamos começar?' : 'Recupere seu acesso'}</h1><p>{mode === 'login' ? 'Suas fichas, sua rotina e cada conquista em um só lugar.' : mode === 'signup' ? 'Informe seus dados e comece a usar o Summer assim que confirmar o cadastro.' : 'Enviaremos um link para você escolher uma nova senha.'}</p></div>
      <form className="auth-form" onSubmit={handleSubmit} aria-busy={loading}>
        <fieldset className={styles.fields} disabled={loading}>
          {mode === 'signup' && <label htmlFor="auth-name">Seu nome<input id="auth-name" name="name" value={name} onChange={e => setName(e.target.value)} placeholder="Como podemos chamar você?" autoComplete="name" maxLength={80} required /></label>}
          {mode === 'signup' && <div className={styles.field}><label htmlFor="auth-registration">Matrícula da academia</label><div className="input-with-icon"><IdCard size={17} aria-hidden="true" /><input id="auth-registration" name="registration" type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={registration} onChange={e => setRegistration(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 números" autoComplete="off" aria-describedby="registration-help" required /></div><small id="registration-help" className="field-help">Use os 4 números fornecidos pela academia.</small></div>}
          <div className={styles.field}><label htmlFor="auth-email">E-mail</label><div className="input-with-icon"><Mail size={17} aria-hidden="true" /><input id="auth-email" name="email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" autoCapitalize="none" spellCheck={false} required /></div></div>
          {mode !== 'reset' && <div className={styles.field}><label htmlFor="auth-password">Senha</label><div className="input-with-icon"><LockKeyhole size={17} aria-hidden="true" /><input id="auth-password" name="password" type={visible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => setCapsLock(e.getModifierState('CapsLock'))} onKeyUp={e => setCapsLock(e.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)} placeholder={mode === 'signup' ? 'Crie uma senha' : 'Sua senha'} minLength={mode === 'signup' ? 8 : undefined} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-describedby={[mode === 'signup' && 'password-help', capsLock && 'caps-lock-help'].filter(Boolean).join(' ') || undefined} required /><button type="button" className={`password-toggle ${styles.passwordToggle}`} onClick={() => setVisible(!visible)} aria-controls="auth-password" aria-pressed={visible} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}>{visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div>{mode === 'signup' && <small id="password-help" className="field-help">Use pelo menos 8 caracteres.</small>}{capsLock && <small id="caps-lock-help" className={styles.capsLock} role="status">Caps Lock está ativado.</small>}</div>}
        </fieldset>
        <div role="status" aria-live="polite" aria-atomic="true" className={styles.feedbackRegion}>{message && <p className={`${styles.feedback} ${messageKind === 'success' ? styles.success : styles.error}`}>{messageKind === 'success' ? <CircleCheck size={19} aria-hidden="true" /> : <CircleHelp size={19} aria-hidden="true" />}<span>{message}</span></p>}</div>
        <button className={`primary-button auth-submit ${styles.submit}`} disabled={loading}>{loading ? <LoaderCircle size={18} className={styles.spinner} aria-hidden="true" /> : null}{loading ? mode === 'login' ? 'ENTRANDO...' : mode === 'signup' ? 'CRIANDO CONTA...' : 'ENVIANDO LINK...' : mode === 'login' ? 'ENTRAR' : mode === 'signup' ? 'CRIAR CONTA' : 'ENVIAR LINK'}{!loading && <ArrowRight size={17} aria-hidden="true" />}</button>
      </form>
      {mode === 'login' && <button className="auth-switch" disabled={loading} onClick={() => switchMode('reset')}>Esqueci minha senha</button>}
      <button className="auth-switch" disabled={loading} onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'É sua primeira vez? Crie uma conta' : 'Voltar para entrar'}</button>
      <p className="auth-footnote">No computador, no Android ou no Safari do iPhone.</p>
    </section>
  </main>
}
