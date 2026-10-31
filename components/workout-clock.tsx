"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { createRestTimerState, formatWorkoutClock, parseRestTimerState, pauseRestTimer, REST_DURATIONS, settleRestTimer, startRestTimer, workoutElapsedSeconds, type RestTimerState } from "@/lib/workout-clock-state";

// The seconds tick only in this small component, not the whole dashboard.
export function WorkoutClock({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(workoutElapsedSeconds(startedAt, Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [startedAt]);
  return <span className="timer" aria-label="Tempo decorrido">{formatWorkoutClock(elapsed)}</span>;
}

export function RestTimer({ storageKey }: { storageKey?: string }) {
  return <RestTimerSession key={storageKey ?? "temporary"} storageKey={storageKey} />;
}

function RestTimerSession({ storageKey }: { storageKey?: string }) {
  const [state, setState] = useState<RestTimerState>(() => createRestTimerState());
  const stateRef = useRef(state);
  const [ready, setReady] = useState(!storageKey);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const persist = useCallback((next: RestTimerState) => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageUnavailable(false);
    } catch {
      setStorageUnavailable(true);
    }
  }, [storageKey]);
  const update = useCallback((next: RestTimerState, save = false) => {
    stateRef.current = next;
    setState(next);
    if (save) persist(next);
  }, [persist]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const now = Date.now();
      const saved = parseRestTimerState(window.localStorage.getItem(storageKey), now);
      if (saved) {
        const restored = settleRestTimer(saved, now);
        update(restored);
        // An elapsed deadline stays completed after reload; mounting never writes defaults.
        if (saved.deadline !== null && restored.deadline === null) persist(restored);
      }
    } catch {
      setStorageUnavailable(true);
    }
    setReady(true);
  }, [storageKey, update, persist]);

  const { duration, remaining, deadline } = state;
  useEffect(() => {
    if (!ready || deadline === null) return;
    const tick = () => {
      const current = stateRef.current;
      if (current.deadline !== deadline) return;
      const next = settleRestTimer(current, Date.now());
      if (next.remaining !== current.remaining || next.deadline !== current.deadline) {
        // Only completion is persisted here; normal ticks remain local to this component.
        update(next, next.deadline === null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [deadline, ready, update]);

  return (
    <div className="rest-timer" aria-busy={!ready}>
      <div className="rest-timer-label"><Timer size={18} /><span>Descanso entre séries</span></div>
      <div className="rest-timer-controls">
        <select aria-label="Tempo de descanso" value={duration} disabled={!ready || deadline !== null} onChange={(event) => {
          update(createRestTimerState(Number(event.target.value)), true);
        }}>
          {REST_DURATIONS.map((seconds) => <option key={seconds} value={seconds}>{seconds}s</option>)}
        </select>
        <strong className="timer">{ready ? formatWorkoutClock(remaining) : "--:--"}</strong>
        <button type="button" className="icon-button" disabled={!ready} aria-label={deadline !== null ? "Pausar descanso" : "Iniciar descanso"} onClick={() => {
          const current = stateRef.current;
          update(current.deadline !== null ? pauseRestTimer(current, Date.now()) : startRestTimer(current, Date.now()), true);
        }}>{deadline ? <Pause size={18} /> : <Play size={18} />}</button>
        <button type="button" className="icon-button" disabled={!ready} aria-label="Reiniciar descanso" onClick={() => update(createRestTimerState(duration), true)}><RotateCcw size={17} /></button>
      </div>
      <span className="rest-finished" role="status">{[
        ready && remaining === 0 ? "Descanso concluído. Pronto para a próxima série?" : "",
        storageUnavailable ? "Não foi possível guardar o descanso neste aparelho." : "",
      ].filter(Boolean).join(" ")}</span>
    </div>
  );
}
