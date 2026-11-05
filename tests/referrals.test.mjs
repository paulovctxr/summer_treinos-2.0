import test from 'node:test';
import assert from 'node:assert/strict';
import { referralCode, referralCookieValue, referralInvitePath } from '../lib/referrals.ts';

test('códigos de indicação são curtos, previsíveis e não carregam dados pessoais', () => {
  assert.equal(referralCode(' Recepcao-01 '), 'recepcao-01');
  for (const value of ['', 'a', 'nome do aluno', '../admin', 'área-vip', 'x'.repeat(33), null])
    assert.equal(referralCode(value), null, String(value));
});

test('cookie de indicação é limitado ao site e expira em trinta dias', () => {
  const cookie = referralCookieValue('avaliacao', true);
  assert.match(cookie, /^summer_referral=avaliacao;/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=2592000/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.equal(referralInvitePath('Recepcao'), '/convite/recepcao');
  assert.throws(() => referralCookieValue('inválido', false), TypeError);
});
