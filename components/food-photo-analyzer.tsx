"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  CalendarDays,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  normalizeFoodPhoto,
  prepareFoodPhoto,
  type FoodPhotoAnalysis,
} from "@/lib/food-photo";
import { MEAL_LABELS, type MealType } from "@/lib/nutrition";
import { parseFoodEntry } from "@/lib/nutrition-tools";
import styles from "./food-photo-analyzer.module.css";

type Step = "choice" | "preview" | "analyzing" | "review";
type Draft = {
  label: string;
  meal_type: MealType;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};
type AnalyzeResponse = {
  ok?: boolean;
  code?: string;
  error?: string;
  analysis?: unknown;
};

const emptyDraft: Draft = {
  label: "",
  meal_type: "other",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
};

function displayDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

async function errorPayload(error: unknown): Promise<AnalyzeResponse> {
  const context =
    error && typeof error === "object" && "context" in error
      ? (error as { context?: unknown }).context
      : null;
  if (context instanceof Response) {
    try {
      return (await context.clone().json()) as AnalyzeResponse;
    } catch {
      return {};
    }
  }
  return {};
}

export function FoodPhotoAnalyzer({
  day,
  onSaved,
}: {
  day: string;
  onSaved: () => Promise<void>;
}) {
  const [step, setStep] = useState<Step>("choice");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [analysis, setAnalysis] = useState<FoodPhotoAnalysis | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");
  const [saving, setSaving] = useState(false);
  const [photoDay, setPhotoDay] = useState(day);
  const pending = useRef(false);
  const mounted = useRef(true);
  const analyzeRequest = useRef<AbortController | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const activeStep = step === "choice" || step === "preview" ? 0 : step === "analyzing" ? 1 : 2;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; analyzeRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    if (step === "review") reviewHeading.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (!file) return;
    const protect = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [file]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function choose(selected: File | undefined) {
    if (!selected || pending.current) return;
    if (cameraInput.current) cameraInput.current.value = "";
    if (galleryInput.current) galleryInput.current.value = "";
    setMessageKind("error");
    if (!selected.type.startsWith("image/")) {
      setMessage("Escolha uma imagem da refeição.");
      return;
    }
    if (selected.size > 15 * 1024 * 1024) {
      setMessage("A foto pode ter no máximo 15 MB.");
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setAnalysis(null);
    setDraft(emptyDraft);
    setMessage("");
    setPhotoDay(day);
    setStep("preview");
  }

  function reset() {
    setFile(null);
    setPreview("");
    setAnalysis(null);
    setDraft(emptyDraft);
    setMessage("");
    setStep("choice");
  }

  function discard() {
    if (pending.current) return;
    if (step === "review" && !window.confirm("Descartar esta análise? A refeição ainda não foi registrada.")) return;
    reset();
  }

  async function analyze() {
    if (!file || pending.current) return;
    pending.current = true;
    const controller = new AbortController();
    analyzeRequest.current = controller;
    setStep("analyzing");
    setMessage("");
    setMessageKind("error");
    try {
      const image = await prepareFoodPhoto(file);
      if (controller.signal.aborted) return;
      const { data, error } =
        await createClient().functions.invoke<AnalyzeResponse>(
          "nutrition-ai-tools",
          { body: { action: "analyze_food_photo", image }, signal: controller.signal, timeout: 90_000 },
        );
      if (!mounted.current || controller.signal.aborted) return;
      if (error) {
        const payload = await errorPayload(error);
        throw new Error(
          payload.error || "Não conseguimos analisar a refeição agora.",
        );
      }
      const normalized = normalizeFoodPhoto(data?.analysis);
      setAnalysis(normalized);
      if (!data?.ok || !normalized.meal) {
        setStep("preview");
        setMessage(
          normalized.qualityIssues[0] ||
            "Não identificamos a comida com segurança. Tire outra foto.",
        );
        return;
      }
      setDraft({
        label: normalized.meal.label,
        meal_type: normalized.meal.meal_type,
        calories: String(normalized.meal.calories),
        protein_g: String(normalized.meal.protein_g),
        carbs_g: String(normalized.meal.carbs_g),
        fat_g: String(normalized.meal.fat_g),
      });
      setStep("review");
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      setStep("preview");
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível analisar esta foto.",
      );
    } finally {
      pending.current = false;
      analyzeRequest.current = null;
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!draft.label.trim()) {
      setMessageKind("error");
      setMessage("Informe o nome da refeição antes de registrar.");
      nameInput.current?.focus();
      return;
    }
    let parsed: ReturnType<typeof parseFoodEntry>;
    try { parsed = parseFoodEntry(draft); }
    catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Revise os valores da refeição.");
      return;
    }
    pending.current = true;
    setSaving(true);
    setMessage("");
    setMessageKind("error");
    const savedDay = photoDay;
    try {
      const { error } = await createClient()
        .from("summer_calorie_entries")
        .insert({
          day: savedDay,
          ...parsed,
        });
      if (error) throw error;
      if (!mounted.current) return;
      reset();
      setMessageKind("success");
      setMessage(`Refeição registrada em ${displayDay(savedDay)}.`);
      // Saving succeeded. A failed refresh must not offer to insert the same meal again.
      try { await onSaved(); }
      catch {
        if (mounted.current) setMessage(`Refeição registrada em ${displayDay(savedDay)}. Atualize o diário para conferir os registros.`);
      }
    } catch {
      if (mounted.current) setMessage("Não foi possível salvar esta refeição. Sua revisão foi mantida; tente novamente.");
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <section className={`food-photo-card ${styles.card}`} aria-labelledby={`${inputId}-title`} aria-busy={step === "analyzing" || saving}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">DIÁRIO COM IA</p>
          <h4 id={`${inputId}-title`}>Registrar alimentação por foto</h4>
          <p>Fotografe o prato, confira a estimativa e confirme antes de salvar.</p>
        </div>
        <Camera size={24} aria-hidden="true" />
      </div>

      <ol className={styles.steps} aria-label="Etapas do registro por foto">
        {["Escolher foto", "Analisar", "Revisar e registrar"].map((label, index) => <li key={label} aria-current={index === activeStep ? "step" : undefined} data-complete={index < activeStep || undefined}><span aria-hidden="true">{index < activeStep ? <Check size={13} /> : index + 1}</span>{label}</li>)}
      </ol>

      <input
        ref={cameraInput}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label="Tirar foto da refeição"
        tabIndex={-1}
        onChange={(event) => choose(event.target.files?.[0])}
      />
      <input
        ref={galleryInput}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Escolher foto da refeição"
        tabIndex={-1}
        onChange={(event) => choose(event.target.files?.[0])}
      />

      {step === "choice" && (
        <div className="food-photo-actions">
          <button className="primary-button" type="button" disabled={saving} onClick={() => cameraInput.current?.click()}>
            <Camera size={18} /> TIRAR FOTO DA COMIDA
          </button>
          <button className="secondary-button" type="button" disabled={saving} onClick={() => galleryInput.current?.click()}>
            <ImagePlus size={18} /> ESCOLHER DA GALERIA
          </button>
        </div>
      )}

      {step === "choice" && <p className={styles.hint}>Deixe os alimentos visíveis e fotografe o prato por inteiro, com boa iluminação. JPG, PNG ou WebP, até 15 MB.</p>}

      {(step === "preview" || step === "analyzing" || step === "review") && preview && (
        <div className="food-photo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Prévia da refeição escolhida" />
        </div>
      )}

      {step !== "choice" && <div className={styles.destination}><CalendarDays size={16} aria-hidden="true" /><span>Registro em <strong>{displayDay(photoDay)}</strong></span>{day !== photoDay && <button className="text-button" type="button" disabled={saving || step === "analyzing"} onClick={() => setPhotoDay(day)}>Usar {displayDay(day)}</button>}</div>}

      {step === "preview" && (
        <div className="food-photo-actions">
          <button className="primary-button" type="button" onClick={() => void analyze()}>
            <Sparkles size={18} /> ANALISAR COM IA
          </button>
          <button className="secondary-button" type="button" onClick={discard}>
            <RotateCcw size={18} /> ESCOLHER OUTRA FOTO
          </button>
        </div>
      )}

      {step === "analyzing" && (
        <div className="food-photo-loading" role="status">
          <LoaderCircle className="spin" size={24} />
          <strong>Analisando sua refeição...</strong>
          <span>Estimando alimentos, porção, calorias e macros. Pode levar alguns instantes.</span>
        </div>
      )}

      {step === "review" && analysis?.meal && (
        <form className="food-photo-review" noValidate onSubmit={save} aria-busy={saving}>
          <div className={`food-photo-review-heading ${styles.reviewHeading}`} ref={reviewHeading} tabIndex={-1}>
            <Check size={18} />
            <div>
              <strong>Confira antes de registrar</strong>
              <span>Os valores são estimativas. Ajuste as porções; calorias são arredondadas para o valor inteiro mais próximo.</span>
            </div>
          </div>
          {(analysis.meal.confidence === "low" || analysis.quality === "low" || analysis.qualityIssues.length > 0) && (
            <div className={styles.warning}><p><AlertTriangle size={17} aria-hidden="true" />A estimativa precisa de atenção</p><ul>{(analysis.qualityIssues.length ? analysis.qualityIssues : ["Confira os alimentos, as porções e os valores abaixo antes de registrar."]).map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul></div>
          )}
          <fieldset className={styles.fields} disabled={saving}>
          <div className="food-photo-fields">
            <label className="wide-field">Alimento ou refeição<input ref={nameInput} required maxLength={100} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
            <label>Tipo<select value={draft.meal_type} onChange={(event) => setDraft({ ...draft, meal_type: event.target.value as MealType })}>{Object.entries(MEAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Calorias (kcal)<input required type="text" inputMode="decimal" maxLength={8} value={draft.calories} onChange={(event) => setDraft({ ...draft, calories: event.target.value })} /></label>
            <label>Proteína (g)<input type="text" inputMode="decimal" maxLength={7} value={draft.protein_g} onChange={(event) => setDraft({ ...draft, protein_g: event.target.value })} /></label>
            <label>Carboidratos (g)<input type="text" inputMode="decimal" maxLength={7} value={draft.carbs_g} onChange={(event) => setDraft({ ...draft, carbs_g: event.target.value })} /></label>
            <label>Gorduras (g)<input type="text" inputMode="decimal" maxLength={7} value={draft.fat_g} onChange={(event) => setDraft({ ...draft, fat_g: event.target.value })} /></label>
          </div>
          </fieldset>
          {analysis.meal.notes && <p className="food-photo-note">{analysis.meal.notes}</p>}
          <div className="food-photo-actions">
            <button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />} {saving ? "REGISTRANDO..." : "CONFIRMAR E REGISTRAR"}</button>
            <button className="secondary-button" type="button" disabled={saving} onClick={discard}>DESCARTAR ANÁLISE</button>
          </div>
        </form>
      )}

      <div role="status" aria-live="polite" aria-atomic="true">{message && <p className={messageKind === "success" ? "success-message" : "notice"}>{message}</p>}</div>
      <small className="nutrition-disclaimer">A foto é usada somente durante a análise e não é armazenada. A IA fornece estimativas; revise porções, calorias e macros antes de confirmar.</small>
    </section>
  );
}
