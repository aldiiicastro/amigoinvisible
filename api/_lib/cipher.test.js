import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipher } from './cipher.js';

const key = () => Buffer.alloc(32, 9).toString('base64');

test('cifra y descifra', () => {
  const c = createCipher(key());
  const blob = c.encrypt('uuid-del-destinatario', 'uuid-de-quien-regala');
  assert.equal(c.decrypt(blob, 'uuid-de-quien-regala'), 'uuid-del-destinatario');
});

test('el valor cifrado no contiene el texto original y cambia en cada cifrado', () => {
  const c = createCipher(key());
  const a = c.encrypt('secreto-visible', 'ctx');
  const b = c.encrypt('secreto-visible', 'ctx');
  assert.notEqual(a, b);
  assert.ok(!Buffer.from(a, 'base64').toString('latin1').includes('secreto-visible'));
});

test('no se puede descifrar con otro contexto (valor copiado a otra fila)', () => {
  const c = createCipher(key());
  const blob = c.encrypt('x', 'fila-1');
  assert.throws(() => c.decrypt(blob, 'fila-2'));
});

test('detecta datos alterados', () => {
  const c = createCipher(key());
  const raw = Buffer.from(c.encrypt('x', 'ctx'), 'base64');
  raw[raw.length - 1] ^= 1;
  assert.throws(() => c.decrypt(raw.toString('base64'), 'ctx'));
  assert.throws(() => c.decrypt('abc', 'ctx'));
});

test('no descifra con otra clave', () => {
  const blob = createCipher(key()).encrypt('x', 'ctx');
  assert.throws(() => createCipher(Buffer.alloc(32, 1).toString('base64')).decrypt(blob, 'ctx'));
});

test('rechaza claves ausentes o de largo incorrecto', () => {
  assert.throws(() => createCipher(undefined), /DATA_ENCRYPTION_KEY/);
  assert.throws(() => createCipher(''), /DATA_ENCRYPTION_KEY/);
  assert.throws(() => createCipher(Buffer.alloc(16).toString('base64')), /32 bytes/);
});
