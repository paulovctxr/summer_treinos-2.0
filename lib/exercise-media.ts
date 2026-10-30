import { EXERCISE_MEDIA } from './exercise-media-catalog.ts';

export type ExerciseMedia = (typeof EXERCISE_MEDIA)[number];

export function normalizeExerciseName(name: string) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const byName = new Map<string, ExerciseMedia>();
for (const media of EXERCISE_MEDIA) {
  for (const name of [media.title, ...media.aliases]) byName.set(normalizeExerciseName(name), media);
}

// Names must match a reviewed alias. Similar names can describe different equipment or movements.
export function exerciseMediaFor(name: string) {
  return byName.get(normalizeExerciseName(name)) || null;
}
