"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ImagePlus,
  Images,
  LoaderCircle,
  PenLine,
  Plus,
  RotateCcw,
  ScanLine,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_IMPORT_EXERCISES,
  MAX_IMPORT_IMAGES,
  normalizeWorkoutImport,
  prepareWorkoutImage,
  prepareWorkoutPhoto,
  validateWorkoutImport,
  workoutImportToFitness,
  type ImportedExercise,
  type WorkoutImportAccess,
  type WorkoutImportAnalysis,
} from "@/lib/workout-import";
import type { Workout } from "@/lib/fitness";
import { ExerciseDemonstration } from "@/components/exercise-demonstration";
import { ExerciseNameInput } from "@/components/exercise-name-input";
import { ExerciseRepetitionsInput } from "@/components/exercise-repetitions-input";
import { exerciseMediaReferencesFor, matchExerciseMedia } from "@/lib/exercise-media";
import {
  clearWorkoutImportDraft,
  loadWorkoutImportDraft,
  saveWorkoutImportDraft,
  type WorkoutImportDraft,
} from "@/lib/workout-import-draft";
import {
  clearWorkoutImportResume,
  markWorkoutImportResume,
} from "@/lib/workout-import-resume";
import styles from "./workout-importer.module.css";

type Step =
  | "choice"
  | "photos"
  | "analyzing"
  | "review"
  | "low-quality"
  | "saving"
  | "success"
  | "limit";
type Photo = { id: string; file: File; preview: string };
type AnalyzeResponse = {
  ok?: boolean;
  code?: string;
  error?: string;
  importId?: string;
  analysis?: unknown;
  usage?: WorkoutImportAccess;
};

function ImportExerciseMedia({ exercise }: { exercise: ImportedExercise }) {
  const match = matchExerciseMedia(exercise.name);
  const references = exerciseMediaReferencesFor(exercise.name);
  return <div className={styles.mediaReview}>
    {exercise.originalName && exercise.originalName !== exercise.name && <p className={styles.originalName}>Identificado na foto: <strong>{exercise.originalName}</strong></p>}
    {references.length > 0 ? <>
      <p className={styles.matched}><Images size={16} aria-hidden="true" />{exercise.name.includes("+") ? "Demonstrações dos movimentos identificados" : "Exercício com demonstração"}</p>
      <ExerciseDemonstration name={exercise.name} />
    </> : <p className={styles.matchHint}>{match.kind === "ambiguous" ? "Confirme a variação do exercício nas sugestões. O nome da foto foi mantido para não trocar a execução." : "Ainda sem demonstração para este nome. O exercício foi mantido; você pode conferir as sugestões."}</p>}
  </div>;
}

export function WorkoutImporter({
  userId,
  resume = false,
  availableWorkoutSlots,
  onClose,
  onManual,
  onSave,
}: {
  userId: string;
  resume?: boolean;
  availableWorkoutSlots: number;
  onClose: () => void;
  onManual: () => void;
  onSave: (workouts: Workout[], importId: string) => Promise<boolean>;
}) {
  const [step, setStep] = useState<Step>(resume ? "photos" : "choice");
  const [access, setAccess] = useState<WorkoutImportAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pendingPhoto, setPendingPhoto] = useState<Photo | null>(null);
  const [analysis, setAnalysis] = useState<WorkoutImportAnalysis | null>(null);
  const [importId, setImportId] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [saved, setSaved] = useState<{
    workouts: number;
    exercises: number;
  } | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const [restoring, setRestoring] = useState(true);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const selecting = useRef(false);
  const mounted = useRef(true);
  const initialResume = useRef(resume);

  function resumableStep(): WorkoutImportDraft["step"] {
    if (step === "choice" || step === "photos" || step === "review" || step === "low-quality") return step;
    return step === "saving" ? "review" : "photos";
  }

  function draftSnapshot(): WorkoutImportDraft {
    return {
      step: resumableStep(),
      photos: photos.map(({ id, file }) => ({ id, file })),
      pendingPhoto: pendingPhoto ? { id: pendingPhoto.id, file: pendingPhoto.file } : null,
      analysis,
      importId,
      updatedAt: Date.now(),
    };
  }

  function preserveBeforePicker(input: HTMLInputElement | null) {
    if (!input) return;
    markWorkoutImportResume(userId);
    void saveWorkoutImportDraft(userId, draftSnapshot()).catch(() => {
      if (mounted.current) setStorageWarning("Este navegador pode não conseguir recuperar a foto. Mantenha esta tela aberta até salvar.");
    });
    // Keep the native picker call in the original user gesture.
    input.click();
  }

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        if (!initialResume.current) {
          await clearWorkoutImportDraft(userId);
          return;
        }
        const draft = await loadWorkoutImportDraft(userId);
        if (cancelled || !draft) return;
        const restorePhoto = (item: { id: string; file: Blob }): Photo => {
          const file = new File([item.file], "ficha.jpg", { type: item.file.type });
          const preview = URL.createObjectURL(file);
          urls.current.add(preview);
          return { id: item.id, file, preview };
        };
        setPhotos(draft.photos.map(restorePhoto));
        setPendingPhoto(draft.pendingPhoto ? restorePhoto(draft.pendingPhoto) : null);
        setAnalysis(draft.analysis);
        setImportId(draft.importId);
        setStep(draft.step);
        setMessage("Recuperamos sua digitalização. Continue de onde parou.");
      } catch {
        if (!cancelled) setStorageWarning("Este navegador não conseguiu recuperar a digitalização. Escolha a foto novamente.");
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (restoring) return;
    const operation = step === "success"
      ? clearWorkoutImportDraft(userId)
      : saveWorkoutImportDraft(userId, draftSnapshot());
    void operation.catch(() => {
      if (mounted.current) setStorageWarning("A foto pode ser usada agora, mas este navegador não conseguiu guardar o andamento. Mantenha esta tela aberta até salvar.");
    });
  }, [userId, restoring, step, photos, pendingPhoto, analysis, importId]);

  async function leave(manual = false) {
    if (restoring || selecting.current || step === "analyzing" || step === "saving") return;
    try {
      await clearWorkoutImportDraft(userId);
    } catch {
      // Closing remains available when storage is blocked.
    }
    if (manual) onManual(); else onClose();
  }

  async function loadAccess() {
    setAccessLoading(true);
    try {
      const { data, error } = await createClient().rpc(
        "summer_get_workout_import_access",
      );
      if (error) throw error;
      setAccess(data as WorkoutImportAccess);
    } catch {
      setAccess(null);
      setMessage(
        "Não foi possível consultar sua cota de digitalizações. Tente novamente.",
      );
    } finally {
      setAccessLoading(false);
    }
  }
  useEffect(() => {
    void loadAccess();
  }, []);
  useEffect(() => {
    mounted.current = true;
    const currentUrls = urls.current;
    return () => {
      mounted.current = false;
      currentUrls.forEach((url) => URL.revokeObjectURL(url));
      currentUrls.clear();
    };
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && event.key === "Escape" && step !== "analyzing" && step !== "saving")
        void leave();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, step, restoring]);

  async function photo(file: File): Promise<Photo> {
    const prepared = await prepareWorkoutPhoto(file);
    const preview = URL.createObjectURL(prepared);
    urls.current.add(preview);
    return { id: crypto.randomUUID(), file: prepared, preview };
  }
  function discard(item: Photo) {
    URL.revokeObjectURL(item.preview);
    urls.current.delete(item.preview);
  }
  function chooseImport() {
    setMessage("");
    if (accessLoading) {
      setMessage("Aguarde enquanto conferimos seu acesso.");
      return;
    }
    if (!access) {
      void loadAccess();
      return;
    }
    if (!access.allowed) {
      setStep("limit");
      return;
    }
    setStep("photos");
  }
  async function selectPhotos(files: FileList | null, camera: boolean) {
    const selected = Array.from(files || []);
    if (cameraInput.current) cameraInput.current.value = "";
    if (galleryInput.current) galleryInput.current.value = "";
    if (!selected.length || selecting.current || restoring) return;
    markWorkoutImportResume(userId);
    selecting.current = true;
    setPreparingPhotos(true);
    setMessage("");
    setStep("photos");
    const room = camera ? 1 : MAX_IMPORT_IMAGES - photos.length;
    const added: Photo[] = [];
    const errors: string[] = [];
    try {
      // Decode one source at a time; previews use only the resized image.
      for (const file of selected.slice(0, room)) {
        try {
          const item = await photo(file);
          if (!mounted.current) { discard(item); break; }
          added.push(item);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Não conseguimos abrir esta foto.");
        }
      }
      if (!mounted.current) {
        added.forEach(discard);
        return;
      }
      if (camera && added[0]) {
        if (pendingPhoto) discard(pendingPhoto);
        setPendingPhoto(added[0]);
      } else if (added.length) {
        setPhotos(current => [...current, ...added]);
      }
      if (selected.length > room) errors.push(`O limite é de ${MAX_IMPORT_IMAGES} fotos por digitalização.`);
      setMessage([...new Set(errors)].join(" "));
    } finally {
      selecting.current = false;
      if (mounted.current) setPreparingPhotos(false);
    }
  }
  function usePendingPhoto() {
    if (!pendingPhoto) return;
    if (photos.length >= MAX_IMPORT_IMAGES) {
      discard(pendingPhoto);
      setPendingPhoto(null);
      setMessage(`O limite é de ${MAX_IMPORT_IMAGES} fotos por digitalização.`);
      return;
    }
    setPhotos((current) => [...current, pendingPhoto]);
    setPendingPhoto(null);
    setMessage("");
  }
  function retake() {
    preserveBeforePicker(cameraInput.current);
  }
  function removePhoto(item: Photo) {
    discard(item);
    setPhotos((current) => current.filter((photo) => photo.id !== item.id));
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
  async function analyze() {
    if (!photos.length) {
      setMessage("Adicione ao menos uma foto da ficha.");
      return;
    }
    setStep("analyzing");
    setMessage("");
    try {
      const images = [];
      for (let index = 0; index < photos.length; index++) {
        setProgress(`Preparando foto ${index + 1} de ${photos.length}...`);
        images.push(await prepareWorkoutImage(photos[index].file));
      }
      setProgress("Identificando exercícios, séries e repetições...");
      const { data, error } =
        await createClient().functions.invoke<AnalyzeResponse>(
          "analyze-workout-sheet",
          { body: { images } },
        );
      if (error) {
        const payload = await errorPayload(error);
        if (payload.code === "limit_reached") {
          await loadAccess();
          setStep("limit");
          return;
        }
        throw new Error(
          payload.error ||
            "Não conseguimos analisar a ficha agora. Tente novamente.",
        );
      }
      if (!data)
        throw new Error("A análise não retornou dados. Tente novamente.");
      const normalized = normalizeWorkoutImport(data.analysis);
      if (!data.ok || !normalized.workouts.length) {
        setAnalysis(normalized);
        setStep("low-quality");
        return;
      }
      setAnalysis(normalized);
      setImportId(String(data.importId || ""));
      setAccess(data.usage || access);
      setStep("review");
    } catch (error) {
      setStep("photos");
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível analisar a ficha.",
      );
    } finally {
      setProgress("");
    }
  }

  function setWorkout(
    workoutId: string,
    patch: Partial<WorkoutImportAnalysis["workouts"][number]>,
  ) {
    setAnalysis((current) =>
      current
        ? {
            ...current,
            workouts: current.workouts.map((workout) =>
              workout.id === workoutId ? { ...workout, ...patch } : workout,
            ),
          }
        : current,
    );
  }
  function setExercise(
    workoutId: string,
    exerciseId: string,
    patch: Partial<ImportedExercise>,
  ) {
    setAnalysis((current) => {
      if (!current) return current;
      return {
        ...current,
        workouts: current.workouts.map((workout) => {
          if (workout.id !== workoutId) return workout;
          return {
            ...workout,
            exercises: workout.exercises.map((exercise) => {
              if (exercise.id !== exerciseId) return exercise;
              const updated = {
                ...exercise,
                ...patch,
                confidence: "high" as const,
              };
              updated.needsReview =
                !updated.name.trim() ||
                updated.name === "Não identificado" ||
                matchExerciseMedia(updated.name).kind === "ambiguous" ||
                updated.sets === null ||
                !updated.repetitions.trim();
              return updated;
            }),
          };
        }),
      };
    });
  }
  function addExercise(workoutId: string) {
    if (!analysis) return;
    const workout = analysis.workouts.find((item) => item.id === workoutId);
    if (!workout || workout.exercises.length >= MAX_IMPORT_EXERCISES) return;
    setWorkout(workoutId, {
      exercises: [
        ...workout.exercises,
        {
          id: crypto.randomUUID(),
          name: "",
          sets: null,
          repetitions: "",
          weight: null,
          weightUnit: "kg",
          restSeconds: null,
          notes: "",
          confidence: "low",
          needsReview: true,
        },
      ],
    });
  }
  function moveExercise(workoutId: string, index: number, direction: -1 | 1) {
    if (!analysis) return;
    const workout = analysis.workouts.find((item) => item.id === workoutId);
    if (
      !workout ||
      index + direction < 0 ||
      index + direction >= workout.exercises.length
    )
      return;
    const exercises = [...workout.exercises];
    const [moved] = exercises.splice(index, 1);
    exercises.splice(index + direction, 0, moved);
    setWorkout(workoutId, { exercises });
  }
  async function save() {
    if (restoring || preparingPhotos) return;
    if (!analysis || !importId) {
      setMessage("A análise expirou. Tire as fotos novamente.");
      return;
    }
    const errors = validateWorkoutImport(analysis, availableWorkoutSlots);
    if (errors.length) {
      setMessage(errors[0]);
      return;
    }
    setStep("saving");
    setMessage("");
    const workouts = workoutImportToFitness(analysis);
    const ok = await onSave(workouts, importId);
    if (!ok) {
      setStep("review");
      setMessage(
        "Não foi possível salvar os treinos. Confira sua conexão e tente novamente.",
      );
      return;
    }
    setSaved({
      workouts: workouts.length,
      exercises: workouts.reduce(
        (total, workout) => total + workout.exercises.length,
        0,
      ),
    });
    clearWorkoutImportResume(userId);
    setStep("success");
    void loadAccess();
  }

  function startAnotherImport() {
    markWorkoutImportResume(userId);
    photos.forEach(discard);
    if (pendingPhoto) discard(pendingPhoto);
    setPhotos([]);
    setPendingPhoto(null);
    setAnalysis(null);
    setImportId("");
    setSaved(null);
    setMessage("");
    setProgress("");
    setStep("photos");
    void loadAccess();
  }

  const reviewErrors = analysis
    ? validateWorkoutImport(analysis, availableWorkoutSlots)
    : [];
  return (
    <div className="import-overlay" role="presentation">
      <section
        className="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <header className="import-header">
          <div>
            <p className="eyebrow">SUMMER FIT</p>
            <h2 id="import-title">
              {step === "choice"
                ? "Adicionar treino"
                : step === "review"
                  ? "Confira seu treino"
                  : step === "success"
                    ? "Treino importado! 🎉"
                    : "Importar treino por foto"}
            </h2>
          </div>
          {step !== "analyzing" && step !== "saving" && (
            <button
              className="icon-button"
              disabled={preparingPhotos || restoring}
              onClick={() => void leave()}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          )}
        </header>
        <input
          ref={cameraInput}
          className="visually-hidden-file"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => void selectPhotos(event.target.files, true)}
        />
        <input
          ref={galleryInput}
          className="visually-hidden-file"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void selectPhotos(event.target.files, false)}
        />

        {restoring && (
          <p className="import-status" role="status">
            Recuperando digitalização…
          </p>
        )}
        {preparingPhotos && (
          <p className="import-status" role="status">
            <LoaderCircle className="spin" size={17} />
            Preparando foto…
          </p>
        )}
        {storageWarning && (
          <p className="import-status" role="status">{storageWarning}</p>
        )}
        {step === "choice" && (
          <div className="import-body">
            <p className="import-lead">Como deseja adicionar seu treino?</p>
            <div className="add-choice-grid">
              <button
                className="add-choice photo-choice"
                disabled={accessLoading || restoring}
                onClick={chooseImport}
              >
                <span>
                  <Camera size={24} />
                </span>
                <div>
                  <strong>Fotografar minha ficha</strong>
                  <small>
                    Transforme sua ficha de papel em um treino digital.
                  </small>
                  {access && (
                    <em>
                      Disponível no Summer Grátis · {access.remaining} de{" "}
                      {access.monthly_limit} digitalizações restantes neste mês
                    </em>
                  )}
                </div>
                <Sparkles size={19} />
              </button>
              <button
                className="add-choice"
                disabled={preparingPhotos || restoring}
                onClick={() => void leave(true)}
              >
                <span>
                  <PenLine size={24} />
                </span>
                <div>
                  <strong>Criar manualmente</strong>
                  <small>Cadastre exercícios, séries e repetições.</small>
                </div>
              </button>
            </div>
            {accessLoading && (
              <p className="import-status">
                <LoaderCircle className="spin" size={17} />
                Conferindo seu acesso...
              </p>
            )}
          </div>
        )}

        {step === "photos" && (
          <div className="import-body">
            {pendingPhoto ? (
              <>
                <p className="import-lead">Confira a foto</p>
                <img
                  className="camera-preview"
                  src={pendingPhoto.preview}
                  alt="Prévia da ficha fotografada"
                />
                <div className="import-actions">
                  <button
                    className="primary-button"
                    disabled={preparingPhotos}
                    onClick={usePendingPhoto}
                  >
                    <Check size={17} />
                    USAR FOTO
                  </button>
                  <button
                    className="secondary-button"
                    disabled={preparingPhotos}
                    onClick={retake}
                  >
                    <RotateCcw size={17} />
                    TIRAR NOVAMENTE
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="photo-guidance">
                  <ScanLine size={28} />
                  <div>
                    <strong>Enquadre toda a ficha</strong>
                    <p>
                      Posicione toda a ficha dentro da imagem e tente evitar
                      reflexos ou sombras.
                    </p>
                  </div>
                </div>
                <div className="import-actions">
                  <button
                    className="primary-button"
                    disabled={preparingPhotos || restoring || photos.length >= MAX_IMPORT_IMAGES}
                    onClick={() => preserveBeforePicker(cameraInput.current)}
                  >
                    <Camera size={17} />
                    FOTOGRAFAR MINHA FICHA
                  </button>
                  <button
                    className="secondary-button"
                    disabled={preparingPhotos || restoring || photos.length >= MAX_IMPORT_IMAGES}
                    onClick={() => preserveBeforePicker(galleryInput.current)}
                  >
                    <ImagePlus size={17} />
                    ESCOLHER DA GALERIA
                  </button>
                </div>
                {photos.length > 0 && (
                  <>
                    <div className="photo-count">
                      <Images size={18} />
                      <strong>{photos.length} foto(s) adicionada(s)</strong>
                      <span>Máximo {MAX_IMPORT_IMAGES}</span>
                    </div>
                    <div className="photo-grid">
                      {photos.map((item, index) => (
                        <figure key={item.id}>
                          <img
                            src={item.preview}
                            alt={`Foto ${index + 1} da ficha`}
                          />
                          <figcaption>
                            Foto {index + 1} de {photos.length}
                            <button
                              className="icon-button"
                              disabled={preparingPhotos}
                              onClick={() => removePhoto(item)}
                              aria-label={`Excluir foto ${index + 1}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                    <button
                      className="primary-button full-button"
                      disabled={preparingPhotos || restoring}
                      onClick={() => void analyze()}
                    >
                      <Sparkles size={18} />
                      ANALISAR FICHAS
                    </button>
                  </>
                )}
              </>
            )}
            <p className="privacy-note">
              O rascunho da foto fica disponível neste navegador por 24 horas
              para recuperar a digitalização. Ele é removido ao salvar ou
              fechar esta tela.
            </p>
          </div>
        )}

        {step === "analyzing" && (
          <div className="import-loading" role="status">
            <div className="scan-animation">
              <ScanLine size={42} />
            </div>
            <h3>Analisando sua ficha...</h3>
            <p>Estamos identificando seus exercícios, séries e repetições.</p>
            <small>{progress}</small>
          </div>
        )}

        {step === "low-quality" && (
          <div className="import-body">
            <div className="quality-warning">
              <AlertTriangle size={34} />
              <h3>Não conseguimos ler bem essa ficha.</h3>
              <p>
                Tente tirar outra foto com mais iluminação e enquadrando toda a
                ficha.
              </p>
              {analysis?.qualityIssues.map((issue) => (
                <span key={issue}>• {issue}</span>
              ))}
            </div>
            <div className="import-actions">
              <button
                className="primary-button"
                onClick={() => {
                  photos.forEach(discard);
                  setPhotos([]);
                  setAnalysis(null);
                  setStep("photos");
                  preserveBeforePicker(cameraInput.current);
                }}
              >
                <Camera size={17} />
                TIRAR OUTRA FOTO
              </button>
              <button
                className="secondary-button"
                disabled={preparingPhotos || restoring}
                onClick={() => void leave(true)}
              >
                <PenLine size={17} />
                CONTINUAR MANUALMENTE
              </button>
            </div>
          </div>
        )}

        {step === "review" && analysis && (
          <div className="import-body">
            <p className="import-lead">
              Os exercícios reconhecidos foram associados aos nomes do catálogo com fotos. Confira as variações, séries e repetições antes de salvar.
            </p>
            {analysis.quality === "low" && (
              <div className="review-alert">
                <AlertTriangle size={18} />
                <span>
                  A qualidade da foto estava baixa. Confira especialmente os
                  campos marcados.
                </span>
              </div>
            )}
            {analysis.qualityIssues.length > 0 && (
              <p className="quality-issues">
                {analysis.qualityIssues.join(" · ")}
              </p>
            )}
            <div className="review-workouts">
              {analysis.workouts.map((workout, workoutIndex) => (
                <section className="review-workout" key={workout.id}>
                  <div className="review-workout-heading">
                    <div>
                      <span>
                        Treino {workoutIndex + 1} de {analysis.workouts.length}
                      </span>
                      <input
                        aria-label={`Nome do treino ${workoutIndex + 1}`}
                        maxLength={80}
                        value={workout.name}
                        onChange={(event) =>
                          setWorkout(workout.id, { name: event.target.value })
                        }
                      />
                      <input
                        aria-label={`Foco do treino ${workoutIndex + 1}`}
                        maxLength={100}
                        placeholder="Foco muscular (opcional)"
                        value={workout.focus}
                        onChange={(event) =>
                          setWorkout(workout.id, { focus: event.target.value })
                        }
                      />
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Excluir ${workout.name}`}
                      onClick={() =>
                        setAnalysis((current) =>
                          current
                            ? {
                                ...current,
                                workouts: current.workouts.filter(
                                  (item) => item.id !== workout.id,
                                ),
                              }
                            : current,
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="review-exercises">
                    {workout.exercises.map((exercise, index) => (
                      <article
                        className={
                          exercise.needsReview || exercise.confidence === "low"
                            ? "review-exercise needs-review"
                            : "review-exercise"
                        }
                        key={exercise.id}
                      >
                        <div className="exercise-review-title">
                          <strong>
                            {index + 1}. {exercise.name || "Exercício sem nome"}
                          </strong>
                          {(exercise.needsReview ||
                            exercise.confidence === "low") && (
                            <span>
                              <AlertTriangle size={14} />
                              Verifique este exercício
                            </span>
                          )}
                          <div className="order-actions">
                            <button
                              className="icon-button"
                              disabled={index === 0}
                              onClick={() =>
                                moveExercise(workout.id, index, -1)
                              }
                              aria-label={`Mover ${exercise.name} para cima`}
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={index === workout.exercises.length - 1}
                              onClick={() => moveExercise(workout.id, index, 1)}
                              aria-label={`Mover ${exercise.name} para baixo`}
                            >
                              <ArrowDown size={15} />
                            </button>
                            <button
                              className="icon-button"
                              onClick={() =>
                                setWorkout(workout.id, {
                                  exercises: workout.exercises.filter(
                                    (item) => item.id !== exercise.id,
                                  ),
                                })
                              }
                              aria-label={`Excluir ${exercise.name}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                        <div className="exercise-review-grid">
                          <label className="wide-field">
                            Exercício
                            <ExerciseNameInput
                              value={exercise.name} inlineSuggestions
                              onChange={(name) =>
                                setExercise(workout.id, exercise.id, {
                                  name,
                                })
                              }
                            />
                          </label>
                          <label>
                            Séries
                            <input
                              type="number"
                              min={1}
                              max={20}
                              placeholder="Ex.: 3"
                              value={exercise.sets ?? ""}
                              onChange={(event) =>
                                setExercise(workout.id, exercise.id, {
                                  sets: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                            />
                          </label>
                          <label>
                            Repetições
                            <ExerciseRepetitionsInput
                              value={exercise.repetitions}
                              onChange={(repetitions) =>
                                setExercise(workout.id, exercise.id, {
                                  repetitions,
                                })
                              }
                            />
                          </label>
                          <label>
                            Carga
                            <input
                              type="number"
                              min={0}
                              max={2000}
                              step="0.5"
                              placeholder="—"
                              value={exercise.weight ?? ""}
                              onChange={(event) =>
                                setExercise(workout.id, exercise.id, {
                                  weight: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                            />
                          </label>
                          <label>
                            Unidade
                            <select
                              value={exercise.weightUnit || "kg"}
                              onChange={(event) =>
                                setExercise(workout.id, exercise.id, {
                                  weightUnit: event.target.value as "kg" | "lb",
                                })
                              }
                            >
                              <option value="kg">kg</option>
                              <option value="lb">lb</option>
                            </select>
                          </label>
                          <label>
                            Descanso (s)
                            <input
                              type="number"
                              min={0}
                              max={3600}
                              placeholder="—"
                              value={exercise.restSeconds ?? ""}
                              onChange={(event) =>
                                setExercise(workout.id, exercise.id, {
                                  restSeconds: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                            />
                          </label>
                          <label className="wide-field">
                            Observações
                            <textarea
                              maxLength={240}
                              rows={2}
                              value={exercise.notes}
                              onChange={(event) =>
                                setExercise(workout.id, exercise.id, {
                                  notes: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <ImportExerciseMedia exercise={exercise} />
                      </article>
                    ))}
                  </div>
                  <button
                    className="secondary-button"
                    disabled={workout.exercises.length >= MAX_IMPORT_EXERCISES}
                    onClick={() => addExercise(workout.id)}
                  >
                    <Plus size={16} />
                    Adicionar exercício
                  </button>
                </section>
              ))}
            </div>
            {reviewErrors.length > 0 && (
              <div className="review-errors" role="alert">
                <AlertTriangle size={17} />
                <span>{reviewErrors[0]}</span>
              </div>
            )}
            <button
              className="primary-button full-button"
              disabled={reviewErrors.length > 0}
              onClick={() => void save()}
            >
              <Check size={18} />
              SALVAR TREINO
            </button>
            <p className="privacy-note">
              Nada será salvo antes desta confirmação.
            </p>
          </div>
        )}

        {step === "saving" && (
          <div className="import-loading" role="status">
            <LoaderCircle className="spin" size={42} />
            <h3>Salvando seus treinos...</h3>
            <p>Estamos vinculando tudo à sua conta.</p>
          </div>
        )}

        {step === "success" && saved && analysis && (
          <div className="import-body success-import">
            <div className="success-icon">
              <Check size={32} />
            </div>
            <p>
              Encontramos {saved.exercises} exercícios distribuídos em{" "}
              {saved.workouts} treino(s).
            </p>
            <div className="success-list">
              {analysis.workouts.map((workout) => (
                <div key={workout.id}>
                  <strong>{workout.name}</strong>
                  <span>{workout.exercises.length} exercícios</span>
                </div>
              ))}
            </div>
            <button
              className="primary-button full-button"
              disabled={preparingPhotos || restoring}
              onClick={() => void leave()}
            >
              VER MEUS TREINOS
            </button>
            <button
              className="secondary-button full-button"
              onClick={startAnotherImport}
            >
              <Camera size={17} />
              DIGITALIZAR OUTRA FICHA
            </button>
          </div>
        )}

        {step === "limit" && (
          <div className="import-body upsell-card">
            <div className="pro-icon">
              <ScanLine size={30} />
            </div>
            <p className="eyebrow">RECURSO DO PLANO GRÁTIS</p>
            <h3>Limite mensal de digitalizações atingido</h3>
            <p>
              A importação por foto continua gratuita. Sua cota será renovada
              automaticamente no início do próximo mês.
            </p>
            <div className="pro-benefit">
              <Camera size={18} />
              <span>
                Cada digitalização pode reunir várias fotos da mesma ficha.
              </span>
            </div>
            <button
              className="primary-button full-button"
              disabled={preparingPhotos || restoring}
              onClick={() => void leave(true)}
            >
              <PenLine size={17} />
              CRIAR TREINO MANUALMENTE
            </button>
          </div>
        )}

        {message && (
          <div className="import-message" role="alert">
            {message}
          </div>
        )}
      </section>
    </div>
  );
}
