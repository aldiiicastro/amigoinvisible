import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, normalizeName, parsePhone, validateEventName } from './validate.js';

test('parsePhone: celular argentino local de 10 dígitos', () => {
  assert.deepEqual(parsePhone('11 2345-6789'), { value: '5491123456789' });
  assert.deepEqual(parsePhone('(011) 2345 6789').error !== undefined, true); // con 0 son 11 dígitos: se rechaza
});

test('parsePhone: formatos con código de país', () => {
  assert.deepEqual(parsePhone('+54 9 11 2345 6789'), { value: '5491123456789' });
  assert.deepEqual(parsePhone('5491123456789'), { value: '5491123456789' });
  assert.deepEqual(parsePhone('+54 11 2345 6789'), { value: '5491123456789' }); // agrega el 9 de celular
  assert.deepEqual(parsePhone('0054 9 11 2345 6789'), { value: '5491123456789' });
});

test('parsePhone: otro país solo con +', () => {
  assert.deepEqual(parsePhone('+598 99 123 456'), { value: '59899123456' });
  assert.ok(parsePhone('598 99 123 456').error);
});

test('parsePhone: rechaza vacío, letras y largos incorrectos', () => {
  assert.ok(parsePhone('').error);
  assert.ok(parsePhone('abc').error);
  assert.ok(parsePhone('1234').error);
  assert.ok(parsePhone('11 15 2345 6789').error); // con el 15
  assert.ok(parsePhone('<script>').error);
});

test('normalizeName y nameKey ignoran espacios, mayúsculas y acentos', () => {
  assert.equal(normalizeName('  Ana   María '), 'Ana María');
  assert.equal(nameKey('Ana María'), nameKey('ana maria'));
  assert.notEqual(nameKey('Ana'), nameKey('Anita'));
});

test('validateEventName', () => {
  assert.deepEqual(validateEventName(' Navidad 2026 '), { value: 'Navidad 2026' });
  assert.ok(validateEventName('   ').error);
  assert.ok(validateEventName('x'.repeat(61)).error);
});
