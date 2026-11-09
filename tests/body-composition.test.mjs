import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBodyComposition, withDerivedComposition } from '../lib/body-composition.ts';
import { newAssessment } from '../lib/assessments.ts';

test('calcula gordura, massa gorda e massa magra pelas três dobras masculinas', () => {
  const data = { birth_date: '1990-01-01', weight: '80', skinfold_chest: '10', skinfold_abdomen: '20', skinfold_thigh: '30' };
  const result = calculateBodyComposition(data, 'HOMENS', '2026-11-09');
  assert.equal(result.age, 36);
  assert.equal(result.skinfoldSum, 60);
  assert.equal(result.bodyFat, 18.6);
  assert.equal(result.fatMass, 14.9);
  assert.equal(result.leanMass, 65.1);
});

test('recalcula campos derivados quando o professor altera as medidas', () => {
  const assessment = { ...newAssessment(), model: 'MULHERES', assessed_on: '2026-11-09', data: { birth_date: '1990-01-01', weight: '70', skinfold_triceps: '15', skinfold_suprailiac: '20', skinfold_thigh: '25' } };
  const prepared = withDerivedComposition(assessment);
  assert.equal(prepared.data.body_fat, '24.5');
  assert.equal(prepared.data.fat_mass, '17.2');
  assert.equal(prepared.data.lean_mass, '52.8');
});

test('não inventa resultado quando faltam idade ou uma dobra', () => {
  const result = calculateBodyComposition({ weight: '80', skinfold_chest: '10', skinfold_abdomen: '20' }, 'HOMENS', '2026-11-09');
  assert.equal(result.bodyFat, null);
  assert.deepEqual(result.missing, ['idade entre 18 e 100 anos', 'dobra da coxa']);
});
