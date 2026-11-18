const PREFIX = 'summer_workout_import_resume:';
const LEGACY_KEY = 'summer_workout_import_resume';
export const WORKOUT_IMPORT_RESUME_TTL = 24 * 60 * 60 * 1000;

export const workoutImportResumeKey = (userId: string) => `${PREFIX}${userId}`;

function browserStorage(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return typeof globalThis[name] === 'undefined' ? null : globalThis[name];
  } catch {
    return null;
  }
}

function safelyRead(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safelyWrite(storage: Storage | null, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Import remains usable when a browser blocks one of the storage areas.
  }
}

function safelyRemove(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // Closing the importer must remain available when storage is blocked.
  }
}

export function hasWorkoutImportResume(userId: string, now = Date.now()): boolean {
  if (!userId.trim()) return false;
  const key = workoutImportResumeKey(userId);
  const session = browserStorage('sessionStorage');
  const local = browserStorage('localStorage');
  if (safelyRead(session, key) === '1') return true;

  const savedAt = Number(safelyRead(local, key));
  const valid = Number.isFinite(savedAt) && savedAt > 0 && now - savedAt < WORKOUT_IMPORT_RESUME_TTL;
  if (!valid) safelyRemove(local, key);
  return valid;
}

export function markWorkoutImportResume(userId: string, now = Date.now()) {
  if (!userId.trim()) return;
  const key = workoutImportResumeKey(userId);
  safelyWrite(browserStorage('sessionStorage'), key, '1');
  safelyWrite(browserStorage('localStorage'), key, String(now));
}

export function clearWorkoutImportResume(userId: string) {
  if (!userId.trim()) return;
  const key = workoutImportResumeKey(userId);
  const session = browserStorage('sessionStorage');
  const local = browserStorage('localStorage');
  safelyRemove(session, key);
  safelyRemove(local, key);
  safelyRemove(session, LEGACY_KEY);
  safelyRemove(local, LEGACY_KEY);
}
