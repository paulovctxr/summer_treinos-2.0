"use client";

import { useLayoutEffect, useRef } from "react";

function fitText(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  const border = element.offsetHeight - element.clientHeight;
  element.style.height = `${element.scrollHeight + border}px`;
}

export function ExerciseRepetitionsInput({ value, onChange, required = false }: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (ref.current) fitText(ref.current);
  }, [value]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.getBoundingClientRect().width;
      if (nextWidth !== width) {
        width = nextWidth;
        fitText(element);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <textarea
    ref={ref}
    aria-label="Repetições"
    className="exercise-repetitions-input"
    rows={1}
    maxLength={40}
    required={required}
    placeholder="Ex.: 10–12"
    value={value}
    onChange={(event) => onChange(event.target.value)}
  />;
}
