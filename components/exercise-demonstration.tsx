"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Images, X } from "lucide-react";
import { exerciseMediaReferencesFor, normalizeExerciseName, type ExerciseMedia } from "@/lib/exercise-media";
import { useModalDialog } from "@/lib/use-modal-dialog";
import styles from "./exercise-demonstration.module.css";

function DemonstrationDialog({ media, name, onClose }: { media: ExerciseMedia; name: string; onClose: () => void }) {
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
          <div><p>DEMONSTRAÇÃO DO EXERCÍCIO</p><h2 id={titleId}>{name}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar demonstração"><X size={20} /></button>
        </header>
        <div className={styles.content}>
          <p className={styles.description} id={descriptionId}>
            {normalizeExerciseName(name) !== normalizeExerciseName(media.title) && <>Referência em fotos: <strong>{media.title}</strong>. </>}
            Compare as posições nas fotos e siga as séries, repetições, ritmo e variações da sua ficha. Confira a técnica e os ajustes do equipamento com o instrutor.
          </p>
          <div className={styles.frames}>
            {media.images.map((src, index) => (
              <figure key={src}>
                <figcaption><span aria-hidden="true">{index + 1}</span>{media.captions[index]}</figcaption>
                {failedImages.includes(src) ? <p className={styles.imageError} role="status">Esta imagem não pôde ser carregada. Feche e abra a demonstração para tentar novamente.</p> :
                  <img src={src} alt={`${media.title}: ${media.captions[index].toLocaleLowerCase("pt-BR")}`} width={850} height={567} loading="lazy" decoding="async" onError={() => setFailedImages((current) => [...current, src])} />}
              </figure>
            ))}
          </div>
          <button type="button" className={`secondary-button ${styles.returnButton}`} onClick={onClose}>Voltar ao exercício</button>
        </div>
      </section>
    </div>, document.body,
  );
}

export function ExerciseDemonstration({ name, showUnavailable = false }: { name: string; showUnavailable?: boolean }) {
  const references = exerciseMediaReferencesFor(name);
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!references.length) return showUnavailable && name.trim().length >= 3 ? <p className={styles.unavailable}>Demonstração ainda não cadastrada para este exercício.</p> : null;
  const combined = name.includes("+");

  return <div className={styles.demo}>
    {references.map(({ media, name: movementName }) => {
      const key = `${media.id}:${movementName}`;
      return <div className={styles.reference} key={key}>
        <button type="button" className={styles.trigger} aria-label={`Ver demonstração de ${movementName}`} aria-haspopup="dialog" onClick={() => setOpenKey(key)}><Images size={18} aria-hidden="true" />{combined ? `Ver: ${movementName}` : "Ver demonstração"}</button>
        {openKey === key && <DemonstrationDialog media={media} name={movementName} onClose={() => setOpenKey(null)} />}
      </div>;
    })}
  </div>;
}
