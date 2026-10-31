"use client";

import { useId, useState } from "react";
import { EXERCISE_MEDIA } from "@/lib/exercise-media-catalog";
import { normalizeExerciseName } from "@/lib/exercise-media";
import styles from "./exercise-name-input.module.css";

export function ExerciseNameInput({ value, onChange, inlineSuggestions = false }: { value: string; onChange: (value: string) => void; inlineSuggestions?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const query = normalizeExerciseName(value);
  const options = query ? EXERCISE_MEDIA.filter((media) => [media.title, ...media.aliases].some((name) => query.split(' ').every((term) => normalizeExerciseName(name).includes(term)))) : [];
  const visible = open && options.length > 0;
  function choose(title: string) { onChange(title); setOpen(false); setSelected(-1); }
  return <div className={styles.field}>
    <input role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={`${id}-options`} aria-activedescendant={visible && selected >= 0 ? `${id}-${selected}` : undefined} value={value} maxLength={80} required placeholder="Ex.: Supino reto" autoComplete="off" onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setSelected(-1); }} onChange={(event) => { onChange(event.target.value); setOpen(true); setSelected(-1); }} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setSelected(-1); }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) { event.preventDefault(); setOpen(true); setSelected((current) => event.key === 'ArrowDown' ? (current + 1) % options.length : (current <= 0 ? options.length - 1 : current - 1)); }
      if (event.key === 'Enter' && visible && selected >= 0) { event.preventDefault(); choose(options[selected].title); }
    }} />
    {visible && <div id={`${id}-options`} role="listbox" aria-label="Exercícios sugeridos" className={`${styles.options} ${inlineSuggestions ? styles.inlineOptions : ""}`}>
      {options.map((media, index) => <div key={media.id} id={`${id}-${index}`} role="option" aria-selected={selected === index} className={styles.option} onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.preventDefault(); choose(media.title); }}><strong>{media.title}</strong><small>Selecionar · demonstração em fotos</small></div>)}
    </div>}
  </div>;
}
