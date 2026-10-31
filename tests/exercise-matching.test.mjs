import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalExerciseName, exerciseMediaFor, exerciseMediaReferencesFor, matchExerciseMedia, normalizeExerciseName } from '../lib/exercise-media.ts';
import { EXERCISE_MEDIA } from '../lib/exercise-media-catalog.ts';
import { EXERCISE_REVIEWED_ALIASES } from '../lib/exercise-reviewed-aliases.ts';

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

test('abreviações revisadas reconhecem a imagem correta sem inferir siglas não confirmadas', () => {
  for (const [name, id] of [
    ['Cad. abdutora', 'cadeira-abdutora'],
    ['Cad. adutora', 'cadeira-adutora'],
    ['Cad. extensora', 'cadeira-extensora'],
    ['Abd. supra solo', 'abdominal-crunch'],
  ]) {
    const match = matchExerciseMedia(name);
    const media = EXERCISE_MEDIA.find((entry) => entry.id === id);
    assert.equal(match.media?.id, id, name);
    assert.equal(match.canonicalName, media.title, name);
    assert.equal(match.originalName, name);
  }
  for (const name of ['Supino reto HBC', 'Desenvolvimento aberto c/HBC', 'Remada curvada HBL']) {
    assert.equal(exerciseMediaFor(name), null, name);
    assert.equal(canonicalExerciseName(name), name);
  }
});

test('referência revisada preserva números de máquina, ordem e orientações no nome original', () => {
  for (const [name, id] of [
    ['Cadeira abdutora (4/5)', 'cadeira-abdutora'],
    ['Cadeira abdutora c/ isometria final (4/5)', 'cadeira-abdutora'],
    ['Cad. extensora com isometria no final', 'cadeira-extensora'],
    ['Cad. extensora drop set', 'cadeira-extensora'],
    ['2. Mesa flexora', 'mesa-flexora'],
    ['Tríceps corda cross (17)', 'triceps-corda'],
  ]) {
    const match = matchExerciseMedia(name);
    assert.equal(match.media?.id, id, name);
    assert.equal(match.originalName, name);
    assert.equal(match.canonicalName, name);
  }
  // Other qualifiers are not stripped to reach a known base movement.
  for (const name of ['Cadeira abdutora unilateral', 'Mesa flexora em pé', 'Cad. extensora invertida']) {
    assert.equal(exerciseMediaFor(name), null, name);
    assert.equal(canonicalExerciseName(name), name);
  }
});

test('aliases revisados apontam para mídias existentes e não introduzem colisões entre variações', () => {
  const aliases = new Map();
  for (const alias of EXERCISE_REVIEWED_ALIASES) {
    assert.ok(EXERCISE_MEDIA.some((media) => media.id === alias.mediaId), alias.name);
    const key = normalizeExerciseName(alias.name);
    assert.ok(!aliases.has(key) || aliases.get(key) === alias.mediaId, alias.name);
    aliases.set(key, alias.mediaId);
    const match = matchExerciseMedia(alias.name);
    assert.equal(match.media?.id, alias.mediaId, alias.name);
    assert.equal(match.canonicalName, alias.preserveName ? alias.name : match.media.title, alias.name);
  }
});

test('combinações associam fotos somente às partes reconhecidas e preservam a prescrição completa', () => {
  const combination = 'Cad. extensora + Cad. adutora';
  const match = matchExerciseMedia(combination);
  assert.equal(match.media, null);
  assert.equal(match.canonicalName, combination);
  assert.deepEqual(exerciseMediaReferencesFor(combination).map(({ media, name }) => ({ id: media.id, name })), [
    { id: 'cadeira-extensora', name: 'Cad. extensora' },
    { id: 'cadeira-adutora', name: 'Cad. adutora' },
  ]);

  const partial = 'Cad. extensora + Movimento do professor + Supino';
  assert.equal(canonicalExerciseName(partial), partial);
  assert.deepEqual(exerciseMediaReferencesFor(partial).map(({ media, name }) => ({ id: media.id, name })), [
    { id: 'cadeira-extensora', name: 'Cad. extensora' },
  ]);
  assert.deepEqual(exerciseMediaReferencesFor('Movimento do professor + Supino'), []);
  assert.deepEqual(exerciseMediaReferencesFor('Cad. extensora / Cad. adutora'), []);
  assert.equal(exerciseMediaFor('Supino reto + com halteres'), null);
  assert.equal(canonicalExerciseName('Supino reto + com halteres'), 'Supino reto + com halteres');
});

test('referências mantêm as partes específicas e não repetem a mesma parte do treino combinado', () => {
  const name = 'Cadeira abdutora (4/5) + Cad. extensora drop set + Cadeira abdutora (4/5)';
  assert.deepEqual(exerciseMediaReferencesFor(name).map(({ media, name }) => ({ id: media.id, name })), [
    { id: 'cadeira-abdutora', name: 'Cadeira abdutora (4/5)' },
    { id: 'cadeira-extensora', name: 'Cad. extensora drop set' },
  ]);
  assert.deepEqual(exerciseMediaReferencesFor('Cad. abdutora').map(({ media, name }) => ({ id: media.id, name })), [
    { id: 'cadeira-abdutora', name: 'Cad. abdutora' },
  ]);
});
