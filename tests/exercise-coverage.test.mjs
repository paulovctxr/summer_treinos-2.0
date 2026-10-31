import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseCoverage } from '../lib/exercise-coverage.ts';

test('levantamento agrega nomes, prioriza imagens pendentes e omite dados pessoais', () => {
  const rows = exerciseCoverage([
    { user_id: 'private-id', email: 'private@example.test', workouts: [{ title: 'Nome do aluno', exercises: [{ name: 'Supino reto c/ halteres' }, { name: 'Supino' }, { name: 'Supino' }] }] },
    { workouts: [{ exercises: [{ name: 'Supino reto c/ halteres' }, { name: 'Agachamento no smith' }] }] },
    null, { workouts: 'invalid' }, { workouts: [null, { exercises: [null, { name: 5 }] }] },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, 'Supino');
  assert.equal(rows[0].occurrences, 2);
  assert.equal(rows[0].match, 'ambiguous');
  assert.equal(rows.at(-1).canonicalName, 'Supino reto com halteres');
  assert.equal(rows.at(-1).occurrences, 2);
  assert.equal(rows.at(-1).hasImages, true);
  assert.ok(!JSON.stringify(rows).includes('private'));
  assert.ok(!JSON.stringify(rows).includes('Nome do aluno'));
});
