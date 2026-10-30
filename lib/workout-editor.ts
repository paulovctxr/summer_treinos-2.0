import type { Exercise, Workout } from './fitness.ts';

function searchText(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}

export function matchesWorkout(workout: Workout, query: string) {
  const terms = searchText(query).split(' ').filter(Boolean);
  const text = searchText([workout.title, workout.focus, ...workout.exercises.map((exercise) => exercise.name)].join(' '));
  return terms.every((term) => text.includes(term));
}

export function moveExercise(exercises: Exercise[], id: string, direction: -1 | 1) {
  const index = exercises.findIndex((exercise) => exercise.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= exercises.length) return exercises;
  const reordered = [...exercises];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered;
}
