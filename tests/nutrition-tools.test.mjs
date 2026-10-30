import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFoodEntry, parseWaterAmount, shiftDiaryDay, shoppingItems, readShoppingChecks, shoppingText } from '../lib/nutrition-tools.ts';

const food = { label: ' Almoço ', meal_type: 'lunch', calories: '560', protein_g: '32,5', carbs_g: '', fat_g: '12.4' };
test('registro manual aceita vírgula e macros opcionais sem inventar calorias ou limitar valores silenciosamente', () => {
  assert.deepEqual(parseFoodEntry(food), { label: 'Almoço', meal_type: 'lunch', calories: 560, protein_g: 32.5, carbs_g: 0, fat_g: 12.4 });
  for (const calories of ['', ' ', '-2', '1e3', '12,5.6', '10001']) assert.throws(() => parseFoodEntry({ ...food, calories }), /Calorias/);
  assert.throws(() => parseFoodEntry({ ...food, label: ' ' }), /nome/);
  assert.throws(() => parseFoodEntry({ ...food, protein_g: '1001' }), /Proteína/);
  assert.equal(parseFoodEntry({ ...food, calories: '125,5' }).calories, 126);
  assert.equal(parseFoodEntry({ ...food, calories: '125,45' }).calories, 125);
});
test('água vazia ou inválida não vira um registro mínimo', () => {
  assert.equal(parseWaterAmount('250'), 250);
  for (const raw of ['', '0', '49', '5001', '250,5', '250.01', 'NaN']) assert.throws(() => parseWaterAmount(raw), /Água/);
});
test('navegação do diário atravessa mês, ano e ano bissexto', () => {
  assert.equal(shiftDiaryDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDiaryDay('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftDiaryDay('2026-02-28', 1), '2026-03-01');
});
test('compras preserva itens repetidos e recupera somente marcações válidas sem duplicação', () => {
  const list = shoppingItems([{ category: 'Feira', name: 'Banana', quantity: '6 un.' }, { category: 'Feira', name: 'Banana', quantity: '6 un.' }]);
  assert.notEqual(list[0].id, list[1].id);
  assert.deepEqual(readShoppingChecks(JSON.stringify([list[0].id, list[0].id, 'old-plan', 2]), list.map((item) => item.id)), [list[0].id]);
  assert.deepEqual(readShoppingChecks('broken', []), []);
  assert.deepEqual(readShoppingChecks('{}', []), []);
  assert.match(shoppingText(list), /Feira\n• Banana — 6 un\./);
});
