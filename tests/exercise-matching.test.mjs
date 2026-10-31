import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalExerciseName, exerciseMediaFor, matchExerciseMedia } from '../lib/exercise-media.ts';

test('canonicalização reconhece títulos, aliases e abreviações revisadas sem alterar a variação', () => {
  const exact = matchExerciseMedia('  SUPINO RETO COM HALTERES ');
  assert.equal(exact.kind, 'exact');
  assert.equal(exact.media.id, 'supino-halteres');
  assert.equal(exact.originalName, '  SUPINO RETO COM HALTERES ');
  assert.equal(exact.canonicalName, 'Supino reto com halteres');
  for (const name of ['supino reto c/ halter', 'Supino reto c/haltere', 'Supino reto halteres']) {
    const result = matchExerciseMedia(name);
    assert.equal(result.kind, 'alias', name);
    assert.equal(result.canonicalName, 'Supino reto com halteres');
    assert.equal(exerciseMediaFor(name).id, 'supino-halteres');
  }
  assert.equal(canonicalExerciseName('triceps polia corda'), 'Tríceps na polia com corda');
  assert.equal(canonicalExerciseName('Rosca direta com barras'), 'Rosca direta com barra');
});

test('nomes vagos pedem revisão em vez de ganhar ângulo, aparelho ou postura por inferência', () => {
  for (const name of ['Supino', 'Supino reto', 'Supino com halteres', 'Desenvolvimento de ombros com halteres']) {
    const result = matchExerciseMedia(name);
    assert.equal(result.kind, 'ambiguous', name);
    assert.equal(result.media, null);
    assert.equal(result.canonicalName, name);
    assert.equal(canonicalExerciseName(name), name);
  }
});

test('qualificadores diferentes nunca recebem a foto de um exercício parecido', () => {
  const flat = exerciseMediaFor('Supino reto com halteres');
  for (const name of ['Supino inclinado com halteres', 'Supino declinado com halteres', 'Supino reto articulado', 'Supino reto no smith', 'Supino reto unilateral', 'Supino reto com pegada fechada']) {
    assert.notEqual(exerciseMediaFor(name)?.id, flat.id, name);
  }
  const rope = exerciseMediaFor('Tríceps na polia com corda');
  for (const name of ['Tríceps na polia com barra', 'Tríceps na polia com corda unilateral', 'Tríceps na polia pegada fechada']) {
    assert.notEqual(exerciseMediaFor(name)?.id, rope.id, name);
  }
  const bar = exerciseMediaFor('Rosca direta com barra');
  assert.notEqual(exerciseMediaFor('Rosca direta na polia')?.id, bar.id);
  assert.notEqual(exerciseMediaFor('Rosca direta no cabo')?.id, bar.id);
});

test('exercícios não reconhecidos mantêm o nome integral sem descartar detalhes do OCR', () => {
  for (const name of ['', 'Movimento do professor', 'Supino reto com halteres + rosca', 'Leg press 45 unilateral', 'Agachamento com barra s/ carga', 'Remada curvada com barra 3x12']) {
    const result = matchExerciseMedia(name);
    assert.equal(result.kind, 'unmatched', name);
    assert.equal(result.media, null);
    assert.equal(result.canonicalName, name);
  }
});
