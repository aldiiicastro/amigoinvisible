import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_PLAYERS, drawAssignments, isValidAssignment } from './draw.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);

test('cumple las reglas para 3 a 40 participantes (muchas repeticiones)', () => {
  for (const n of [3, 4, 5, 10, 25, 40]) {
    for (let i = 0; i < 200; i++) {
      const list = ids(n);
      const pairs = drawAssignments(list);
      assert.ok(isValidAssignment(list, pairs), `n=${n}`);
    }
  }
});

test('nadie se regala a sí mismo, cada uno regala y recibe exactamente una vez', () => {
  const list = ids(10);
  const pairs = drawAssignments(list);
  assert.equal(new Set(pairs.map((p) => p.giver)).size, 10);
  assert.equal(new Set(pairs.map((p) => p.recipient)).size, 10);
  assert.ok(pairs.every((p) => p.giver !== p.recipient));
});

test('es uniforme: con 3 personas aparecen los 2 sorteos posibles, ~50/50', () => {
  const counts = new Map();
  const runs = 4000;
  for (let i = 0; i < runs; i++) {
    const key = drawAssignments(ids(3)).map((p) => p.recipient).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 2);
  for (const c of counts.values()) assert.ok(c > runs * 0.4 && c < runs * 0.6, String(c));
});

test('con 4 personas aparecen los 9 sorteos posibles, ninguno domina', () => {
  const counts = new Map();
  const runs = 9000;
  for (let i = 0; i < runs; i++) {
    const key = drawAssignments(ids(4)).map((p) => p.recipient).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 9);
  for (const c of counts.values()) assert.ok(c > 700 && c < 1300, String(c)); // esperado ≈ 1000
});

test('rechaza menos del mínimo y participantes repetidos', () => {
  assert.equal(MIN_PLAYERS, 3);
  assert.throws(() => drawAssignments(ids(2)), /al menos 3/);
  assert.throws(() => drawAssignments(['a', 'b', 'a']), /repetidos/);
});

test('admite restricciones a futuro (por ejemplo, dos parejas)', () => {
  const list = ids(6);
  const forbidden = new Set(['p0>p1', 'p1>p0', 'p2>p3', 'p3>p2']);
  for (let i = 0; i < 200; i++) {
    const pairs = drawAssignments(list, { isAllowed: (g, r) => !forbidden.has(`${g}>${r}`) });
    assert.ok(isValidAssignment(list, pairs));
    assert.ok(pairs.every((p) => !forbidden.has(`${p.giver}>${p.recipient}`)));
  }
});

test('si las restricciones no tienen solución, falla en vez de colgarse', () => {
  assert.throws(() => drawAssignments(ids(3), { isAllowed: () => false, maxAttempts: 50 }), /No se encontró/);
});

test('isValidAssignment detecta sorteos inválidos', () => {
  const list = ids(3);
  assert.ok(!isValidAssignment(list, [{ giver: 'p0', recipient: 'p0' }, { giver: 'p1', recipient: 'p2' }, { giver: 'p2', recipient: 'p1' }]));
  assert.ok(!isValidAssignment(list, [{ giver: 'p0', recipient: 'p1' }, { giver: 'p1', recipient: 'p1' }, { giver: 'p2', recipient: 'p0' }]));
  assert.ok(!isValidAssignment(list, [{ giver: 'p0', recipient: 'p1' }, { giver: 'p1', recipient: 'p2' }]));
});
