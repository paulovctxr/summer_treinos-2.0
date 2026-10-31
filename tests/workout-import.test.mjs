import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWorkoutImport, validateWorkoutImport, workoutImportToFitness } from '../lib/workout-import.ts'

test('normalizes AI data, preserves order and removes exact photo overlap', () => {
  const analysis = normalizeWorkoutImport({ quality: 'good', qualityIssues: [], workouts: [{
    name: ' Treino A ', focus: ' Peito ', exercises: [
      { name: 'Supino reto', sets: 4, repetitions: '10', weight: 30, weightUnit: 'kg', restSeconds: 90, notes: null, confidence: 'high', needsReview: false },
      { name: 'Supino reto', sets: 4, repetitions: '10', weight: 30, weightUnit: 'kg', restSeconds: 90, notes: null, confidence: 'high', needsReview: false },
      { name: 'Crucifixo', sets: 3, repetitions: '12', weight: null, weightUnit: null, restSeconds: null, notes: 'controle', confidence: 'medium', needsReview: false },
    ],
  }] })
  assert.equal(analysis.quality, 'good')
  assert.equal(analysis.workouts[0].name, 'Treino A')
  assert.equal(analysis.workouts[0].exercises.length, 2)
  assert.deepEqual(validateWorkoutImport(analysis, 1), [])
  const workouts = workoutImportToFitness(analysis)
  assert.equal(workouts[0].exercises[0].weight, 30)
  assert.equal(workouts[0].exercises[0].restSeconds, 90)
  assert.equal(workouts[0].exercises[1].notes, 'controle')
})

test('never treats unreadable fields as valid invented data', () => {
  const analysis = normalizeWorkoutImport({ quality: 'low', qualityIssues: ['Imagem tremida'], workouts: [{ name: '', exercises: [{ name: '', sets: null, repetitions: null, confidence: 'low', needsReview: true }] }] })
  assert.equal(analysis.quality, 'low')
  assert.equal(analysis.workouts[0].exercises[0].name, 'Não identificado')
  assert.equal(analysis.workouts[0].exercises[0].sets, null)
  assert.ok(validateWorkoutImport(analysis).length >= 2)
  assert.throws(() => workoutImportToFitness(analysis), /nome do exercício/i)
})

test('blocks saving more imported workout blocks than available slots', () => {
  const analysis = normalizeWorkoutImport({ quality: 'good', workouts: [
    { name: 'A', exercises: [{ name: 'Agachamento', sets: 4, repetitions: '8', confidence: 'high' }] },
    { name: 'B', exercises: [{ name: 'Remada', sets: 3, repetitions: '12', confidence: 'high' }] },
  ] })
  assert.match(validateWorkoutImport(analysis, 1)[0], /espaço para apenas 1/i)
})

test('digitalização padroniza equivalências com imagem e preserva o texto original e os detalhes da ficha', () => {
  const analysis = normalizeWorkoutImport({ quality: 'good', workouts: [{ name: 'A', exercises: [
    { name: 'Supino reto c/ halteres', sets: 4, repetitions: '8–10', weight: 14, weightUnit: 'kg', restSeconds: 90, notes: 'Cadência lenta', confidence: 'high' },
    { name: 'Triceps corda', sets: 3, repetitions: '12', confidence: 'high' },
    { name: 'Supino', sets: 3, repetitions: '10', confidence: 'high' },
    { name: 'Agachamento no smith', sets: 4, repetitions: '8', confidence: 'high' },
    { name: 'Remada unilateral no cabo', sets: 3, repetitions: '12', confidence: 'high' },
  ] }] });
  const [bench, rope, vague, smith, cable] = analysis.workouts[0].exercises;
  assert.equal(bench.name, 'Supino reto com halteres');
  assert.equal(bench.originalName, 'Supino reto c/ halteres');
  assert.equal(rope.name, 'Tríceps na polia com corda');
  assert.equal(vague.name, 'Supino');
  assert.equal(vague.needsReview, true);
  assert.equal(smith.name, 'Agachamento no Smith');
  assert.equal(smith.originalName, 'Agachamento no smith');
  assert.equal(cable.name, 'Remada unilateral no cabo');
  const saved = workoutImportToFitness(analysis)[0].exercises;
  const { id: savedId, ...savedFields } = saved[0];
  assert.ok(savedId);
  assert.deepEqual(savedFields, { name: bench.name, sets: 4, reps: '8–10', weight: 14, weightUnit: 'kg', restSeconds: 90, notes: 'Cadência lenta' });
  assert.ok(!('originalName' in saved[0]));
  assert.equal(saved[2].name, 'Supino');
});

test('salvar revisão também padroniza alias editado sem mudar a variação escolhida', () => {
  const analysis = normalizeWorkoutImport({ quality: 'good', workouts: [{ name: 'A', exercises: [{ name: 'Supino', sets: 3, repetitions: '10', confidence: 'high' }] }] });
  analysis.workouts[0].exercises[0].name = 'Supino inclinado c/ halteres';
  assert.equal(workoutImportToFitness(analysis)[0].exercises[0].name, 'Supino inclinado com halteres');
});

test('a importação conserva protocolos, códigos, cardio e exercícios combinados ao oferecer fotos', () => {
  const names = ['Cad. abdutora', 'Cadeira abdutora c/ isometria final (4/5)', 'Esteira - alternar corrida/caminhar', 'Cad. extensora + infra solo'];
  const analysis = normalizeWorkoutImport({ quality: 'good', workouts: [{ name: 'A', exercises: names.map(name => ({ name, sets: 4, repetitions: '8–10', restSeconds: 90, notes: 'Manter orientação do instrutor', confidence: 'high' })) }] });
  const saved = workoutImportToFitness(analysis)[0].exercises;
  assert.deepEqual(saved.map(exercise => exercise.name), ['Cadeira abdutora', ...names.slice(1)]);
  for (const exercise of saved) {
    assert.equal(exercise.sets, 4);
    assert.equal(exercise.reps, '8–10');
    assert.equal(exercise.restSeconds, 90);
    assert.equal(exercise.notes, 'Manter orientação do instrutor');
  }
});
