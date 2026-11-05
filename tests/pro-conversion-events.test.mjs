import test from 'node:test';
import assert from 'node:assert/strict';
import { safeProConversionSource, safeReferralCode } from '../lib/pro-conversion-events.ts';

test('códigos de indicação aceitam somente o formato público limitado', () => {
  assert.equal(safeReferralCode(' Recepcao-01 '), 'recepcao-01');
  assert.equal(safeReferralCode('instrutor_paulo'), null);
  assert.equal(safeReferralCode('../segredo'), null);
  assert.equal(safeReferralCode('a'.repeat(41)), null);
  assert.equal(safeReferralCode(null), null);
});

test('origens desconhecidas não viram metadados livres', () => {
  assert.equal(safeProConversionSource('nutrition'), 'nutrition');
  assert.equal(safeProConversionSource('dados-do-aluno'), 'unknown');
  assert.equal(safeProConversionSource(null), 'unknown');
});
