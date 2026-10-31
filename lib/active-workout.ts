import type { Exercise, Workout } from './fitness.ts';

export type ActiveWorkoutSnapshot = {
  version: 1;
  id: string;
  userId: string;
  workout: Workout;
  startedAt: number;
  checked: string[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number, required = true): value is string {
  return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
}

function number(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validExercise(value: unknown): value is Exercise {
  return record(value)
    && text(value.id, 80)
    && text(value.name, 80)
    && number(value.sets, 1, 20) && Number.isInteger(value.sets)
    && text(value.reps, 40)
    && (value.weight === undefined || number(value.weight, 0, 2000))
    && (value.weightUnit === undefined || value.weightUnit === 'kg' || value.weightUnit === 'lb')
    && (value.restSeconds === undefined || number(value.restSeconds, 0, 3600))
    && (value.notes === undefined || text(value.notes, 240, false));
}

function validWorkout(value: unknown): value is Workout {
  if (!record(value)
    || !text(value.id, 80)
    || !text(value.title, 80)
    || !text(value.focus, 100, false)
    || !number(value.minutes, 1, 240)
    || !Array.isArray(value.exercises)
    || value.exercises.length < 1
    || value.exercises.length > 20
    || !value.exercises.every(validExercise)) return false;

  return new Set(value.exercises.map((exercise) => exercise.id)).size === value.exercises.length;
}

function copyWorkout(workout: Workout): Workout {
  return {
    id: workout.id,
    title: workout.title,
    focus: workout.focus,
    minutes: workout.minutes,
    exercises: workout.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      ...(exercise.weight === undefined ? {} : { weight: exercise.weight }),
      ...(exercise.weightUnit === undefined ? {} : { weightUnit: exercise.weightUnit }),
      ...(exercise.restSeconds === undefined ? {} : { restSeconds: exercise.restSeconds }),
      ...(exercise.notes === undefined ? {} : { notes: exercise.notes }),
    })),
  };
}

export function activeWorkoutStorageKey(userId: string): string {
  return `summer-active-workout:${encodeURIComponent(userId)}`;
}

export function createActiveWorkout(
  userId: string,
  workout: Workout,
  startedAt = Date.now(),
): ActiveWorkoutSnapshot {
  if (!text(userId, 200) || !validWorkout(workout) || !number(startedAt, Number.MIN_VALUE, Number.MAX_VALUE)) {
    throw new TypeError('Dados inválidos para iniciar o treino.');
  }
  return {
    version: 1,
    id: crypto.randomUUID(),
    userId,
    workout: copyWorkout(workout),
    startedAt,
    checked: [],
  };
}

/** Restores the original clock base and completion id, even after a long absence. */
export function readActiveWorkout(raw: string | null, userId: string): ActiveWorkoutSnapshot | null {
  if (raw === null || !text(userId, 200)) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!record(value)
    || value.version !== 1
    || !text(value.id, 200)
    || value.userId !== userId
    || !validWorkout(value.workout)
    || !number(value.startedAt, Number.MIN_VALUE, Number.MAX_VALUE)
    || !Array.isArray(value.checked)) return null;

  const exerciseIds = new Set(value.workout.exercises.map((exercise) => exercise.id));
  const checked = [...new Set(value.checked.filter((id): id is string => typeof id === 'string' && exerciseIds.has(id)))];
  return {
    version: 1,
    id: value.id,
    userId,
    workout: copyWorkout(value.workout),
    startedAt: value.startedAt,
    checked,
  };
}
