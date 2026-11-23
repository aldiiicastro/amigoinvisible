import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSessionCookie,
  isValidRecoveryCodeShape,
  newRecoveryCode,
  newToken,
  normalizeRecoveryCode,
  parseCookies,
  sessionCookie,
  sha256,
  tokenFromRequest,
} from './auth.js';

test('newToken: 32 bytes aleatorios y distintos cada vez', () => {
  const a = newToken();
  const b = newToken();
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a, 'base64url').length, 32);
});

test('newRecoveryCode: formato XXXX-XXXX-XXXX-XXXX sin símbolos ambiguos', () => {
  const code = newRecoveryCode();
  assert.match(code, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  assert.doesNotMatch(code, /[ILO01]/);
  assert.notEqual(code, newRecoveryCode());
});

test('normalizeRecoveryCode acepta minúsculas, espacios y guiones', () => {
  const code = newRecoveryCode();
  assert.equal(normalizeRecoveryCode(code.toLowerCase().replaceAll('-', ' ')), normalizeRecoveryCode(code));
  assert.ok(isValidRecoveryCodeShape(normalizeRecoveryCode(code)));
  assert.ok(!isValidRecoveryCodeShape('ABC'));
});

test('sha256 es determinista', () => {
  assert.equal(sha256('a'), sha256('a'));
  assert.notEqual(sha256('a'), sha256('b'));
});

test('cookies: lectura y atributos de seguridad', () => {
  assert.deepEqual(parseCookies('a=1; ai_admin=xyz; b=2'), { a: '1', ai_admin: 'xyz', b: '2' });
  assert.equal(tokenFromRequest({ headers: { cookie: 'x=1; ai_admin=tok' } }), 'tok');
  assert.equal(tokenFromRequest({ headers: {} }), null);

  const set = sessionCookie('tok', { headers: { 'x-forwarded-proto': 'https' } });
  for (const attr of ['HttpOnly', 'SameSite=Strict', 'Path=/api', 'Secure', 'Max-Age=']) assert.ok(set.includes(attr), attr);

  const local = sessionCookie('tok', { headers: { 'x-forwarded-proto': 'http' } });
  assert.ok(!local.includes('Secure'));
  assert.ok(clearSessionCookie({ headers: {} }).includes('Max-Age=0'));
});
