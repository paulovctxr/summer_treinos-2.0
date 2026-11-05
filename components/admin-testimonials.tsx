"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, MessageSquareQuote, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  consentMethodLabels,
  readAdminTestimonials,
  TESTIMONIAL_QUOTE_MAX,
  TESTIMONIAL_QUOTE_MIN,
  testimonialStatusLabels,
  type AdminTestimonial,
  type TestimonialConsentMethod,
  type TestimonialStatus,
} from "@/lib/testimonials";
import styles from "./admin-testimonials.module.css";

const methodOptions = Object.entries(consentMethodLabels) as [TestimonialConsentMethod, string][];

function dateTimeLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function AdminTestimonials() {
  const titleId = useId();
  const [supabase] = useState(createClient);
  const [items, setItems] = useState<AdminTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | "create" | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const [quote, setQuote] = useState("");
  const [consentedAt, setConsentedAt] = useState("");
  const [consentMethod, setConsentMethod] = useState<TestimonialConsentMethod>("formulario");
  const [sourceNote, setSourceNote] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("summer_admin_testimonials");
    if (error) {
      setErrorMessage(error.message);
      setItems([]);
    } else {
      setItems(readAdminTestimonials(data));
      setErrorMessage("");
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function createTestimonial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");
    const consentDate = new Date(consentedAt);
    if (!consentConfirmed || !Number.isFinite(consentDate.getTime())) {
      setErrorMessage("Confirme a autorização e informe quando ela foi concedida.");
      return;
    }
    setBusyId("create");
    const { error } = await supabase.rpc("summer_admin_create_testimonial", {
      p_display_name: displayName,
      p_display_label: displayLabel || null,
      p_quote: quote,
      p_consented_at: consentDate.toISOString(),
      p_consent_method: consentMethod,
      p_consent_confirmed: true,
      p_member_user_id: null,
      p_source_note: sourceNote || null,
    });
    if (error) {
      setErrorMessage(error.message);
    } else {
      setDisplayName("");
      setDisplayLabel("");
      setQuote("");
      setConsentedAt("");
      setSourceNote("");
      setConsentConfirmed(false);
      setMessage("Depoimento salvo como rascunho. Revise o texto antes de publicar.");
      await load();
    }
    setBusyId(null);
  }

  async function setStatus(id: number, status: Extract<TestimonialStatus, "published" | "revoked">) {
    setMessage("");
    setErrorMessage("");
    setBusyId(id);
    const { error } = await supabase.rpc("summer_admin_set_testimonial_status", {
      p_testimonial_id: id,
      p_status: status,
    });
    if (error) setErrorMessage(error.message);
    else {
      setMessage(status === "published"
        ? "Depoimento publicado para os alunos."
        : "Depoimento retirado da área pública.");
      await load();
    }
    setBusyId(null);
  }

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <header className={styles.heading}>
        <span className={styles.headingIcon} aria-hidden="true"><MessageSquareQuote size={23} /></span>
        <div>
          <p className={styles.eyebrow}>PROVA SOCIAL COM CONSENTIMENTO</p>
          <h2 id={titleId}>Depoimentos reais</h2>
          <p>Cadastre relatos autorizados como rascunho. Somente o administrador pode publicá-los.</p>
        </div>
      </header>

      <div className={styles.layout}>
        <form className={styles.form} onSubmit={createTestimonial}>
          <div className={styles.formHeading}>
            <ShieldCheck size={20} aria-hidden="true" />
            <div><strong>Novo depoimento</strong><small>Não inclua sobrenome, telefone ou outro dado pessoal no texto público.</small></div>
          </div>

          <div className={styles.twoColumns}>
            <label>Primeiro nome
              <input required maxLength={40} autoComplete="off" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Ana" />
            </label>
            <label>Identificação geral <span>(opcional)</span>
              <input maxLength={60} autoComplete="off" value={displayLabel} onChange={(event) => setDisplayLabel(event.target.value)} placeholder="Ex.: Aluna da musculação" />
            </label>
          </div>

          <label>Relato autorizado
            <textarea required minLength={TESTIMONIAL_QUOTE_MIN} maxLength={TESTIMONIAL_QUOTE_MAX} value={quote} onChange={(event) => setQuote(event.target.value)} placeholder="Transcreva somente o que a pessoa autorizou publicar." />
            <small className={styles.counter}>{quote.length}/{TESTIMONIAL_QUOTE_MAX} caracteres</small>
          </label>

          <div className={styles.twoColumns}>
            <label>Data e hora da autorização
              <input required type="datetime-local" value={consentedAt} onChange={(event) => setConsentedAt(event.target.value)} />
            </label>
            <label>Como foi registrada
              <select value={consentMethod} onChange={(event) => setConsentMethod(event.target.value as TestimonialConsentMethod)}>
                {methodOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <label>Referência interna <span>(opcional e privada)</span>
            <input maxLength={500} autoComplete="off" value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="Ex.: conversa recebida em 01/11" />
          </label>

          <label className={styles.consent}>
            <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} />
            <span><strong>Confirmo a autorização expressa</strong>A pessoa aprovou o texto e concordou com a publicação do primeiro nome.</span>
          </label>

          <button className="primary-button" type="submit" disabled={busyId !== null || !consentConfirmed}>
            {busyId === "create" ? <LoaderCircle className={styles.spin} size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
            {busyId === "create" ? "SALVANDO…" : "SALVAR RASCUNHO"}
          </button>
        </form>

        <div className={styles.listArea}>
          <div className={styles.listHeading}>
            <div><strong>Relatos cadastrados</strong><small>Rascunhos não aparecem para os alunos.</small></div>
            <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading || busyId !== null}>Atualizar</button>
          </div>

          {(message || errorMessage) && <p className={errorMessage ? styles.error : styles.success} role="status">{errorMessage || message}</p>}

          {loading ? (
            <div className={styles.loading} role="status"><LoaderCircle className={styles.spin} size={20} aria-hidden="true" />Carregando relatos…</div>
          ) : items.length === 0 ? (
            <div className={styles.empty}><MessageSquareQuote size={26} aria-hidden="true" /><strong>Nenhum depoimento cadastrado</strong><span>A área pública exibirá apenas o convite neutro até que exista um relato real e aprovado.</span></div>
          ) : (
            <div className={styles.list}>
              {items.map((item) => (
                <article className={styles.item} key={item.id}>
                  <div className={styles.itemTop}>
                    <div><strong>{item.displayName}</strong>{item.displayLabel && <small>{item.displayLabel}</small>}</div>
                    <span className={`${styles.status} ${styles[item.status]}`}>{testimonialStatusLabels[item.status]}</span>
                  </div>
                  <blockquote>“{item.quote}”</blockquote>
                  <dl>
                    <div><dt>Consentimento</dt><dd>{dateTimeLabel(item.consentedAt)}</dd></div>
                    <div><dt>Registro</dt><dd>{consentMethodLabels[item.consentMethod]}</dd></div>
                  </dl>
                  <div className={styles.actions}>
                    {item.status !== "published" && <button className="primary-button" type="button" onClick={() => void setStatus(item.id, "published")} disabled={busyId !== null}>
                      <Eye size={16} aria-hidden="true" />PUBLICAR
                    </button>}
                    {item.status !== "revoked" && <button className="secondary-button" type="button" onClick={() => void setStatus(item.id, "revoked")} disabled={busyId !== null}>
                      <EyeOff size={16} aria-hidden="true" />RETIRAR
                    </button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
