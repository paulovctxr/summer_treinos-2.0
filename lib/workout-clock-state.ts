export const REST_DURATIONS = [30, 45, 60, 90, 120, 180] as const;

export type RestTimerState = {
  version: 1;
  duration: number;
  remaining: number;
  deadline: number | null;
};

export function restTimerStorageKey(userId: string, sessionId: string) {
  return `summer-rest-timer:v1:${encodeURIComponent(userId)}:${encodeURIComponent(sessionId)}`;
}

export function formatWorkoutClock(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60) % 60;
  const parts = [minutes, total % 60].map((part) => part.toString().padStart(2, "0"));
  if (total >= 3600) parts.unshift(Math.floor(total / 3600).toString().padStart(2, "0"));
  return parts.join(":");
}

export function workoutElapsedSeconds(startedAt: number, now: number) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function createRestTimerState(duration = 60): RestTimerState {
  const seconds = REST_DURATIONS.some((value) => value === duration) ? duration : 60;
  return { version: 1, duration: seconds, remaining: seconds, deadline: null };
}

export function parseRestTimerState(raw: string | null, now: number): RestTimerState | null {
  if (!raw || raw.length > 1000 || !Number.isFinite(now)) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const state = value as Record<string, unknown>;
    if (state.version !== 1 || typeof state.duration !== "number" || !REST_DURATIONS.some((duration) => duration === state.duration)) return null;
    if (typeof state.remaining !== "number" || !Number.isInteger(state.remaining) || state.remaining < 0 || state.remaining > state.duration) return null;
    if (state.deadline !== null && (typeof state.deadline !== "number" || !Number.isSafeInteger(state.deadline) || state.deadline <= 0 || state.deadline > now + state.duration * 1000 + 1000 || state.remaining === 0)) return null;
    return { version: 1, duration: state.duration, remaining: state.remaining, deadline: state.deadline as number | null };
  } catch {
    return null;
  }
}

export function restTimerRemaining(state: RestTimerState, now: number) {
  if (state.deadline === null) return state.remaining;
  return Math.min(state.duration, Math.max(0, Math.ceil((state.deadline - now) / 1000)));
}

export function settleRestTimer(state: RestTimerState, now: number): RestTimerState {
  const remaining = restTimerRemaining(state, now);
  return { ...state, remaining, deadline: remaining === 0 ? null : state.deadline };
}

export function pauseRestTimer(state: RestTimerState, now: number): RestTimerState {
  return { ...state, remaining: restTimerRemaining(state, now), deadline: null };
}

export function startRestTimer(state: RestTimerState, now: number): RestTimerState {
  const remaining = state.remaining || state.duration;
  return { ...state, remaining, deadline: now + remaining * 1000 };
}
