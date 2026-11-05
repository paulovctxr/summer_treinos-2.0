"use client";

import { useEffect, useId, useState } from "react";
import { MessageCircleHeart, Quote, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { readPublishedTestimonials, type PublicTestimonial } from "@/lib/testimonials";
import styles from "./pro-testimonials.module.css";

export function ProTestimonials({ className = "" }: { className?: string }) {
  const titleId = useId();
  const [testimonials, setTestimonials] = useState<PublicTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void supabase.rpc("summer_get_pro_testimonials").then(({ data, error }) => {
      if (!active) return;
      setTestimonials(error ? [] : readPublishedTestimonials(data));
      setUnavailable(Boolean(error));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <section className={`${styles.section} ${className}`.trim()} aria-labelledby={titleId} aria-busy={loading}>
      <header className={styles.heading}>
        <span className={styles.headingIcon} aria-hidden="true"><MessageCircleHeart size={23} /></span>
        <div>
          <p className={styles.eyebrow}>EXPERIÊNCIAS REAIS</p>
          <h2 id={titleId}>O que os alunos escolheram compartilhar</h2>
          <p>Relatos publicados somente depois de uma autorização expressa.</p>
        </div>
      </header>

      {loading ? (
        <div className={styles.loading} role="status">
          <span />
          <span />
          <span className={styles.loadingText}>Carregando depoimentos autorizados…</span>
        </div>
      ) : testimonials.length > 0 ? (
        <div className={styles.grid}>
          {testimonials.map((testimonial, index) => (
            <figure className={styles.card} key={`${testimonial.displayName}-${testimonial.publishedAt}-${index}`}>
              <Quote className={styles.quoteIcon} size={23} aria-hidden="true" />
              <blockquote>“{testimonial.quote}”</blockquote>
              <figcaption>
                <span className={styles.avatar} aria-hidden="true">{testimonial.displayName.charAt(0).toLocaleUpperCase("pt-BR")}</span>
                <span>
                  <strong>{testimonial.displayName}</strong>
                  {testimonial.displayLabel && <small>{testimonial.displayLabel}</small>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <ShieldCheck size={28} aria-hidden="true" />
          <div>
            <h3>{unavailable ? "Depoimentos indisponíveis agora" : "Este espaço começa com relatos reais"}</h3>
            <p>{unavailable
              ? "Não foi possível carregar os relatos autorizados neste momento."
              : "Conte à equipe como o Summer está ajudando na sua rotina. Seu relato pode aparecer aqui com sua autorização."}</p>
          </div>
        </div>
      )}

      <p className={styles.invitation}>
        <ShieldCheck size={16} aria-hidden="true" />
        Quer contar sua experiência? Fale com a equipe da academia. Seu relato só será publicado com sua autorização.
      </p>
    </section>
  );
}
