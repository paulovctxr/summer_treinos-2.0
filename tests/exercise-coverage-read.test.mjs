import test from 'node:test';
import assert from 'node:assert/strict';
import { readExerciseCoverage } from '../lib/exercise-coverage-read.ts';

function fixtureRequest(repeatRange = false) {
  let calls = 0;
  return async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(url.searchParams.get('select'), 'workouts:data->workouts');
    assert.equal(url.searchParams.get('order'), 'user_id.asc');
    assert.equal(options.redirect, 'error');
    calls++;
    assert.ok(calls <= 2, 'no repeated or unlimited paging');
    if (calls === 1) {
      assert.equal(options.headers.Range, '0-499');
      return new Response(JSON.stringify([
        { workouts: [{ exercises: [{ name: 'Supino reto com halteres' }] }] },
        { workouts: [{ exercises: [{ name: 'Supino' }] }] },
      ]), { status: 206, headers: { 'content-range': '0-1/3' } });
    }
    assert.equal(options.headers.Range, '2-501');
    return new Response(JSON.stringify([{ workouts: [{ exercises: [{ name: 'Supino' }] }] }]), {
      status: 206, headers: { 'content-range': repeatRange ? '0-0/3' : '2-2/3' },
    });
  };
}

test('leitura pagina pela quantidade real recebida e emite somente inventário agregado', async () => {
  const report = await readExerciseCoverage('https://coverage.example.test', 'fixture-only', fixtureRequest());
  assert.equal(report.returnedRecords, 3);
  assert.equal(report.distinctNames, 2);
  assert.equal(report.exercises[0].name, 'Supino');
  assert.equal(report.exercises[0].occurrences, 2);
  assert.ok(!JSON.stringify(report).includes('fixture-only'));
});

test('paginação incompatível é rejeitada sem retornar relatório parcial', async () => {
  await assert.rejects(readExerciseCoverage('https://coverage.example.test', 'fixture-only', fixtureRequest(true)), /invalid_response/);
});

test('sem configuração ou usando HTTP a leitura não faz nenhum pedido', async () => {
  const noRequest = () => { assert.fail('unexpected request'); };
  await assert.rejects(readExerciseCoverage('', '', noRequest), /missing_configuration/);
  await assert.rejects(readExerciseCoverage('http://coverage.example.test', 'fixture-only', noRequest), /invalid_url/);
});
