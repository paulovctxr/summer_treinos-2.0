"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Images, X } from "lucide-react";
import { exerciseMediaFor, type ExerciseMedia } from "@/lib/exercise-media";
import { useModalDialog } from "@/lib/use-modal-dialog";
import styles from "./exercise-demonstration.module.css";

function DemonstrationDialog({ media, onClose }: { media: ExerciseMedia; onClose: () => void }) {
  const dialog = useModalDialog(onClose);
  const titleId = useId();
  const descriptionId = useId();
  const [failedImages, setFailedImages] = useState<string[]>([]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  return createPortal(
    <div className={styles.overlay} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.dialog} ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <header className={styles.header}>
          <div><p>DEMONSTRAÇÃO DO EXERCÍCIO</p><h2 id={titleId}>{media.title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar demonstração"><X size={20} /></button>
        </header>
        <div className={styles.content}>
          <p className={styles.description} id={descriptionId}>Compare as posições nas fotos. Confira a técnica e os ajustes do equipamento com o instrutor.</p>
          <div className={styles.frames}>
            {media.images.map((src, index) => (
              <figure key={src}>
                <figcaption><span aria-hidden="true">{index + 1}</span>{media.captions[index]}</figcaption>
                {failedImages.includes(src) ? <p className={styles.imageError} role="status">Esta imagem não pôde ser carregada. Feche e abra a demonstração para tentar novamente.</p> :
                  <img src={src} alt={`${media.title}: ${media.captions[index].toLocaleLowerCase("pt-BR")}`} width={850} height={567} loading="lazy" decoding="async" onError={() => setFailedImages((current) => [...current, src])} />}
              </figure>
            ))}
          </div>
          <div className={styles.footer}><span>Referência em duas fotografias</span><a href={media.sourceUrl} target="_blank" rel="noopener noreferrer">Fonte das imagens<span className={styles.srOnly}> (abre em nova aba)</span></a></div>
          <button type="button" className={`secondary-button ${styles.returnButton}`} onClick={onClose}>Voltar ao exercício</button>
        </div>
      </section>
    </div>, document.body,
  );
}

export function ExerciseDemonstration({ name, showUnavailable = false }: { name: string; showUnavailable?: boolean }) {
  const media = exerciseMediaFor(name);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!media) return showUnavailable && name.trim().length >= 3 ? <p className={styles.unavailable}>Demonstração ainda não cadastrada para este exercício.</p> : null;

  return <div className={styles.demo}>
    <button type="button" className={styles.trigger} aria-label={`Ver demonstração de ${media.title}`} aria-haspopup="dialog" onClick={() => setOpenId(media.id)}><Images size={18} aria-hidden="true" />Ver demonstração</button>
    {openId === media.id && <DemonstrationDialog media={media} onClose={() => setOpenId(null)} />}
  </div>;
}
