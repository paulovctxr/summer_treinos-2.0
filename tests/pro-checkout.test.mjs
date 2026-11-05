import test from 'node:test';
import assert from 'node:assert/strict';
import { annualMonthlyEquivalent, proPaymentWhatsAppUrl } from '../lib/pro-checkout.ts';

test('o plano anual mostra o valor mensal equivalente sem alterar o total cobrado', () => {
  assert.equal(annualMonthlyEquivalent(11990), 999);
  assert.equal(annualMonthlyEquivalent(-10), 0);
});

test('o comprovante abre uma mensagem com plano, valor e conta identificados', () => {
  const url = new URL(proPaymentWhatsAppUrl({
    phone: '+55 (21) 97431-2734', plan: 'annual', amountCents: 11990,
    email: 'aluna@example.test',
  }));
  assert.equal(url.hostname, 'wa.me');
  assert.equal(url.pathname, '/5521974312734');
  const text = url.searchParams.get('text');
  assert.match(text, /Plano anual/);
  assert.match(text, /R\$\s*119,90/);
  assert.match(text, /aluna@example\.test/);
});
