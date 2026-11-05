import test from 'node:test';
import assert from 'node:assert/strict';
import { proConversionSummary } from '../lib/pro-conversion.ts';

const fitness = sessions => ({ version: 1, goal: 3, workouts: [], sessions });
const session = (id, completedAt, minutes, exercises = []) => ({ id, workoutId: 'w', title: 'Treino', completedAt, minutes, exercises });
const exercise = (name, weight, weightUnit = 'kg') => ({ exerciseId: name, name, sets: 3, reps: '10', weight, weightUnit });

test('a oferta reconhece aumento real comparando o primeiro e o último registro do mesmo exercício', () => {
  const summary = proConversionSummary(fitness([
    session('1', '2026-01-01T12:00:00Z', 40, [exercise('Supino reto', 20)]),
    session('2', '2026-01-08T12:00:00Z', 45, [exercise('Supino reto', 24)]),
  ]));
  assert.equal(summary.kind, 'load-progress');
  assert.deepEqual(summary.loadProgress, { exerciseName: 'Supino reto', firstWeightKg: 20, latestWeightKg: 24, differenceKg: 4 });
  assert.match(summary.description, /4 kg acima do primeiro registro/);
  assert.equal(summary.totalMinutes, 85);
});

test('não afirma evolução quando a carga caiu, ficou igual ou existe somente um ponto', () => {
  const summary = proConversionSummary(fitness([
    session('1', '2026-01-01T12:00:00Z', 30, [exercise('Agachamento', 30), exercise('Remada', 20)]),
    session('2', '2026-01-08T12:00:00Z', 35, [exercise('Agachamento', 25)]),
  ]));
  assert.equal(summary.kind, 'activity');
  assert.equal(summary.loadProgress, null);
  assert.match(summary.title, /2 treinos/);
});

test('converte libras para comparar cargas e escolhe o maior aumento comprovado', () => {
  const summary = proConversionSummary(fitness([
    session('1', '2026-01-01T12:00:00Z', 30, [exercise('Rosca', 22, 'lb'), exercise('Leg press', 50)]),
    session('2', '2026-01-08T12:00:00Z', 35, [exercise('Rosca', 33, 'lb'), exercise('Leg press', 52)]),
  ]));
  assert.equal(summary.loadProgress.exerciseName, 'Rosca');
  assert.equal(summary.loadProgress.firstWeightKg, 10);
  assert.equal(summary.loadProgress.latestWeightKg, 15);
  assert.equal(summary.loadProgress.differenceKg, 5);
});

test('sem histórico usa uma apresentação inicial sem inventar métricas', () => {
  const summary = proConversionSummary(fitness([]));
  assert.equal(summary.kind, 'getting-started');
  assert.equal(summary.totalSessions, 0);
  assert.deepEqual(summary.metrics, []);
  assert.equal(summary.loadProgress, null);
});
