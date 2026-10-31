import test from 'node:test';
import assert from 'node:assert/strict';
import { activeWorkoutStorageKey, createActiveWorkout, readActiveWorkout } from '../lib/active-workout.ts';

const workout = {
  id: 'treino-a', title: 'Treino A', focus: 'Peito e braços', minutes: 45,
  exercises: [
    { id: 'supino', name: 'Supino reto', sets: 4, reps: '8–12', weight: 25.5, weightUnit: 'kg', restSeconds: 90, notes: 'Movimento controlado' },
    { id: 'triceps', name: 'Tríceps corda', sets: 3, reps: '12' },
  ],
};
const userId = 'aluno-a';
const startedAt = Date.UTC(2020, 0, 1, 10);
const makeSnapshot = () => createActiveWorkout(userId, workout, startedAt);
const restore = (snapshot, account = userId) => readActiveWorkout(JSON.stringify(snapshot), account);

test('reabrir mantém id, ficha completa, exercícios marcados e a base original do cronômetro sem expiração', () => {
  const active = { ...makeSnapshot(), checked: ['supino'] };
  const restored = restore(active);
  assert.deepEqual(restored, active);
  const reopenedAgain = restore(restored);
  assert.equal(reopenedAgain.id, active.id);
  const now = startedAt + (2 * 60 * 60 + 37) * 1000;
  assert.equal(Math.floor((now - reopenedAgain.startedAt) / 1000), 7237);
});

test('cada conta tem uma chave e não pode restaurar o treino de outra conta', () => {
  assert.notEqual(activeWorkoutStorageKey(userId), activeWorkoutStorageKey('aluno-b'));
  assert.notEqual(activeWorkoutStorageKey('a:b'), activeWorkoutStorageKey('a%3Ab'));
  assert.equal(restore(makeSnapshot(), 'aluno-b'), null);
  assert.equal(restore(makeSnapshot(), ''), null);
});

test('a ficha da sessão não muda quando a ficha de edição é modificada depois de iniciar', () => {
  const editable = structuredClone(workout);
  const active = createActiveWorkout(userId, editable, startedAt);
  editable.title = 'Título alterado';
  editable.exercises[0].reps = '20';
  editable.exercises.pop();
  assert.deepEqual(active.workout, workout);
  assert.deepEqual(active.checked, []);
  assert.notEqual(active.id, makeSnapshot().id);
});

test('descarta exercícios marcados inexistentes, entradas inválidas e duplicatas sem alterar o id da sessão', () => {
  const active = { ...makeSnapshot(), checked: ['supino', 'inexistente', 7, null, 'supino', 'triceps'] };
  const restored = restore(active);
  assert.deepEqual(restored.checked, ['supino', 'triceps']);
  assert.equal(restored.id, active.id);
});

test('JSON ausente, malformado, outra versão e esquema incompleto não restauram uma sessão', () => {
  for (const raw of [null, '', '{', 'null', '[]', 'true', '1']) {
    assert.equal(readActiveWorkout(raw, userId), null, String(raw));
  }
  const active = makeSnapshot();
  for (const patch of [
    { version: 2 }, { id: '' }, { id: 123 }, { userId: null },
    { startedAt: 0 }, { startedAt: -1 }, { startedAt: '123' },
    { checked: null }, { checked: {} }, { workout: null },
  ]) {
    assert.equal(restore({ ...active, ...patch }), null, JSON.stringify(patch));
  }
  const { startedAt: omitted, ...incomplete } = active;
  assert.ok(omitted);
  assert.equal(restore(incomplete), null);
  assert.equal(readActiveWorkout(JSON.stringify(active).replace(String(startedAt), '1e999'), userId), null);
});

test('exige ficha completa e exercícios válidos sem completar ou limitar os valores fornecidos', () => {
  const active = makeSnapshot();
  for (const patch of [
    { id: '' }, { title: '' }, { focus: null }, { minutes: 0 }, { minutes: 241 },
    { exercises: [] }, { exercises: Array.from({ length: 21 }, (_, id) => ({ ...workout.exercises[0], id: String(id) })) },
    { exercises: [workout.exercises[0], workout.exercises[0]] },
  ]) {
    assert.equal(restore({ ...active, workout: { ...workout, ...patch } }), null, JSON.stringify(patch));
  }
  for (const patch of [
    { id: '' }, { name: '' }, { sets: 0 }, { sets: 21 }, { sets: 1.5 },
    { reps: '' }, { reps: 12 }, { weight: -1 }, { weight: 2001 }, { weightUnit: 'stone' },
    { restSeconds: -1 }, { restSeconds: 3601 }, { notes: 42 },
  ]) {
    const invalidWorkout = { ...workout, exercises: [{ ...workout.exercises[0], ...patch }] };
    assert.equal(restore({ ...active, workout: invalidWorkout }), null, JSON.stringify(patch));
    assert.throws(() => createActiveWorkout(userId, invalidWorkout, startedAt), TypeError);
  }
  for (const invalidTime of [0, -1, NaN, Infinity]) {
    assert.throws(() => createActiveWorkout(userId, workout, invalidTime), TypeError);
  }
});
