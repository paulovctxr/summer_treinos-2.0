import type { WorkoutImportAnalysis } from './workout-import';

export type WorkoutImportDraftPhoto = { id: string; file: Blob };
export type WorkoutImportDraft = {
  step: 'choice' | 'photos' | 'review' | 'low-quality';
  photos: WorkoutImportDraftPhoto[];
  pendingPhoto: WorkoutImportDraftPhoto | null;
  analysis: WorkoutImportAnalysis | null;
  importId: string;
  updatedAt: number;
};

const DATABASE = 'summer-workout-import-drafts';
const STORE = 'drafts';
export const WORKOUT_IMPORT_DRAFT_TTL = 24 * 60 * 60 * 1000;
const queued = new Map<string, Promise<unknown>>();

function ordered<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  if (!userId.trim()) return Promise.reject(new Error('Conta inválida.'));
  const result = (queued.get(userId) || Promise.resolve()).catch(() => {}).then(operation);
  queued.set(userId, result);
  const cleanup = () => { if (queued.get(userId) === result) queued.delete(userId); };
  void result.then(cleanup, cleanup);
  return result;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador não permite guardar a digitalização.'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o rascunho.'));
    request.onsuccess = () => resolve(request.result);
  });
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const numeric = (value: unknown, max: number) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max);
const photo = (value: unknown): value is WorkoutImportDraftPhoto =>
  record(value) && text(value.id, 80) && !!value.id && value.file instanceof Blob &&
  value.file.size > 0 && value.file.size <= 15 * 1024 * 1024 && value.file.type.startsWith('image/');

function analysis(value: unknown): value is WorkoutImportAnalysis {
  if (!record(value) || !['good', 'low'].includes(String(value.quality)) ||
    !Array.isArray(value.qualityIssues) || value.qualityIssues.length > 30 || !value.qualityIssues.every(v => text(v, 2000)) ||
    !Array.isArray(value.workouts) || value.workouts.length > 8) return false;
  return value.workouts.every(w => record(w) && text(w.id, 80) && !!w.id && text(w.name, 80) && text(w.focus, 100) &&
    Array.isArray(w.exercises) && w.exercises.length <= 20 && w.exercises.every(e =>
      record(e) && text(e.id, 80) && !!e.id && text(e.name, 80) &&
      (e.originalName === undefined || text(e.originalName, 80)) && numeric(e.sets, 20) &&
      text(e.repetitions, 40) && numeric(e.weight, 2000) && [null, 'kg', 'lb'].includes(e.weightUnit as string | null) &&
      numeric(e.restSeconds, 3600) && text(e.notes, 240) && ['high', 'medium', 'low'].includes(String(e.confidence)) &&
      typeof e.needsReview === 'boolean'));
}

function validDraft(value: unknown, now: number): value is WorkoutImportDraft {
  if (!record(value) || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt) ||
    value.updatedAt > now + 60_000 || now - value.updatedAt >= WORKOUT_IMPORT_DRAFT_TTL ||
    !['choice', 'photos', 'review', 'low-quality'].includes(String(value.step)) ||
    !Array.isArray(value.photos) || value.photos.length > 4 || !value.photos.every(photo) ||
    !(value.pendingPhoto === null || photo(value.pendingPhoto)) ||
    value.photos.length + (value.pendingPhoto ? 1 : 0) > 4 ||
    !(value.analysis === null || analysis(value.analysis)) || !text(value.importId, 80)) return false;
  const ids = [...value.photos.map(p => p.id), ...(value.pendingPhoto ? [value.pendingPhoto.id] : [])];
  if (new Set(ids).size !== ids.length) return false;
  if (value.step === 'review' && (!value.analysis || !value.importId)) return false;
  if (value.step === 'low-quality' && !value.analysis) return false;
  return true;
}

export function loadWorkoutImportDraft(userId: string): Promise<WorkoutImportDraft | null> {
  return ordered(userId, async () => {
    const db = await openDatabase();
    return new Promise<WorkoutImportDraft | null>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const request = store.get(userId);
      let draft: WorkoutImportDraft | null = null;
      request.onsuccess = () => {
        const saved: unknown = request.result;
        if (record(saved) && saved.version === 1 && saved.userId === userId && validDraft(saved.draft, Date.now())) {
          draft = saved.draft;
        } else if (saved !== undefined) {
          store.delete(userId);
        }
      };
      transaction.oncomplete = () => { db.close(); resolve(draft); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Não foi possível recuperar a digitalização.')); };
      transaction.onerror = () => {};
    });
  });
}

export function saveWorkoutImportDraft(userId: string, draft: WorkoutImportDraft): Promise<void> {
  // Capture immediately so callers can keep editing while an earlier write finishes.
  let snapshot: WorkoutImportDraft;
  try {
    snapshot = structuredClone(draft);
    if (!validDraft(snapshot, Date.now())) throw new Error('Rascunho de digitalização inválido.');
  } catch (error) { return Promise.reject(error); }
  return ordered(userId, async () => {
    const db = await openDatabase();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put({ version: 1, userId, draft: snapshot }, userId);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Não foi possível guardar a digitalização.')); };
      transaction.onerror = () => {};
    });
  });
}

export function clearWorkoutImportDraft(userId: string): Promise<void> {
  return ordered(userId, async () => {
    const db = await openDatabase();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete(userId);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Não foi possível remover o rascunho.')); };
      transaction.onerror = () => {};
    });
  });
}
