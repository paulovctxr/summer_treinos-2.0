import { matchExerciseMedia, type ExerciseMediaMatch } from './exercise-media.ts';

export type ExerciseCoverageRow = { name: string; occurrences: number; canonicalName: string; hasImages: boolean; match: ExerciseMediaMatch['kind'] };

/** Aggregate exercise names only. Student identifiers, workout titles and history are not returned. */
export function exerciseCoverage(records: unknown[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const workouts = (record as { workouts?: unknown }).workouts;
    if (!Array.isArray(workouts)) continue;
    for (const workout of workouts) {
      if (!workout || !Array.isArray(workout.exercises)) continue;
      for (const exercise of workout.exercises) {
        if (typeof exercise?.name !== 'string') continue;
        const name = exercise.name.trim().replace(/\s+/g, ' ').slice(0, 80);
        if (name) counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
  }
  const rows: ExerciseCoverageRow[] = Array.from(counts, ([name, occurrences]) => {
    const match = matchExerciseMedia(name);
    return { name, occurrences, canonicalName: match.canonicalName, hasImages: Boolean(match.media), match: match.kind };
  });
  return rows.sort((a, b) => Number(a.hasImages) - Number(b.hasImages) || b.occurrences - a.occurrences || a.name.localeCompare(b.name, 'pt-BR'));
}
