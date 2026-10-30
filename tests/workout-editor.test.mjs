import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesWorkout, moveExercise } from '../lib/workout-editor.ts';

const exercises = [
  { id: 'a', name: 'Elevação lateral', sets: 3, reps: '12', weight: 8, weightUnit: 'kg', notes: 'Sem impulso' },
  { id: 'b', name: 'Supino reto', sets: 4, reps: '10' },
  { id: 'c', name: 'Tríceps corda', sets: 3, reps: '12', restSeconds: 60 },
];
const workout = { id: 'treino-a', title: 'Treino A', focus: 'Peito, ombros e braços', minutes: 45, exercises };

test('busca combina termos do título, foco e exercícios, ignorando acentos e espaços extras', () => {
  for (const query of [' BRACOS ', '  treino   elevacao ', 'TRÍCEPS', 'ombros supino', '']) {
    assert.equal(matchesWorkout(workout, query), true, query);
  }
  assert.equal(matchesWorkout(workout, 'treino agachamento'), false);
  assert.equal(matchesWorkout({ ...workout, exercises: [] }, 'supino'), false);
});

test('reordenar preserva os detalhes e a lista original e respeita os limites', () => {
  const reordered = moveExercise(exercises, 'b', -1);
  assert.deepEqual(reordered.map((exercise) => exercise.id), ['b', 'a', 'c']);
  assert.equal(reordered[1], exercises[0]);
  assert.deepEqual(exercises.map((exercise) => exercise.id), ['a', 'b', 'c']);
  assert.deepEqual(moveExercise(reordered, 'b', 1), exercises);
  assert.equal(moveExercise(exercises, 'a', -1), exercises);
  assert.equal(moveExercise(exercises, 'c', 1), exercises);
  assert.equal(moveExercise(exercises, 'missing', 1), exercises);
});
