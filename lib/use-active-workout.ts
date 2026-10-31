"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { activeWorkoutStorageKey, createActiveWorkout, readActiveWorkout, type ActiveWorkoutSnapshot } from "@/lib/active-workout";
import { restTimerStorageKey } from "@/lib/workout-clock-state";
import type { Workout } from "@/lib/fitness";

export function useActiveWorkout(userId: string) {
  const key = activeWorkoutStorageKey(userId);
  const [active, setActive] = useState<ActiveWorkoutSnapshot | null>(null);
  const current = useRef<ActiveWorkoutSnapshot | null>(null);
  const unsaved = useRef(false);
  const discarded = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [storageIssue, setStorageIssue] = useState(false);

  const apply = useCallback((next: ActiveWorkoutSnapshot | null) => {
    current.current = next;
    setActive(next);
  }, []);

  const read = useCallback(() => {
    try {
      const stored = readActiveWorkout(window.localStorage.getItem(key), userId);
      const saved = stored?.id === discarded.current ? null : stored;
      if (unsaved.current && current.current && (!saved || saved.id === current.current.id)) {
        return { available: true, saved: current.current };
      }
      unsaved.current = false;
      setStorageIssue(false);
      return { available: true, saved };
    } catch {
      setStorageIssue(true);
      return { available: false, saved: current.current };
    }
  }, [key, userId]);

  useEffect(() => {
    const restore = () => apply(read().saved);
    restore();
    setReady(true);
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) restore();
    };
    const visible = () => { if (!document.hidden) restore(); };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", restore);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", restore);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [key, apply, read]);

  // Save in the user's action, before a tab can close; never write an empty
  // initial render or depend on a timer/unmount to preserve the workout.
  const save = useCallback((next: ActiveWorkoutSnapshot) => {
    apply(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
      unsaved.current = false;
      setStorageIssue(false);
    } catch {
      unsaved.current = true;
      setStorageIssue(true);
    }
  }, [key, apply]);

  const start = useCallback((workout: Workout) => {
    if (!ready) return false;
    const { saved } = read();
    if (saved) {
      apply(saved);
      return false;
    }
    save(createActiveWorkout(userId, workout));
    return true;
  }, [ready, read, apply, save, userId]);

  const toggle = useCallback((sessionId: string, exerciseId: string, checked: boolean) => {
    const { saved } = read();
    if (!saved || saved.id !== sessionId) {
      apply(saved);
      return;
    }
    if (!saved.workout.exercises.some((exercise) => exercise.id === exerciseId)) return;
    save({
      ...saved,
      checked: checked
        ? [...new Set([...saved.checked, exerciseId])]
        : saved.checked.filter((id) => id !== exerciseId),
    });
  }, [read, apply, save]);

  const clear = useCallback((sessionId: string) => {
    const { saved } = read();
    if (saved && saved.id !== sessionId) {
      apply(saved);
      return;
    }
    apply(null);
    unsaved.current = false;
    discarded.current = sessionId;
    try {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(restTimerStorageKey(userId, sessionId));
      setStorageIssue(false);
    } catch {
      setStorageIssue(true);
    }
  }, [key, userId, read, apply]);

  return { active, ready, storageIssue, start, toggle, clear };
}
