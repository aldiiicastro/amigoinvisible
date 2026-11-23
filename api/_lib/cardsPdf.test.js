import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildCardsPdf, checkClue, LAYOUT, MAX_CLUE_LENGTH } from './cardsPdf.js';
import { shuffle } from './random.js';

const card = (i, text = `Pista número ${i}`) => ({ recipient: `Persona ${i}`, text });
const round = (n, count) => ({ round: n, cards: Array.from({ length: count }, (_, i) => card(i)) });

test('la grilla entra en una hoja A4', () => {
  const { page, card: c, cols, rows, marginX, marginTop } = LAYOUT;
  assert.ok(2 * marginX + cols * c.w <= page.w);
  assert.ok(marginTop + rows * c.h <= page.h);
});

test('10 participantes y 3 rondas → 6 páginas A4, 2 por ronda', async () => {
  const bytes = await buildCardsPdf([round(1, 10), round(2, 10), round(3, 10)]);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 6);
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(Math.abs(width - 595.28) < 0.5 && Math.abs(height - 841.89) < 0.5);
});

test('las rondas no comparten página: 7 tarjetas por ronda → 2 páginas cada una', async () => {
  const doc = await PDFDocument.load(await buildCardsPdf([round(1, 7), round(2, 7), round(3, 7)]));
  assert.equal(doc.getPageCount(), 6);
});

test('el PDF no lleva autor, productor, creador ni fechas', async () => {
  const doc = await PDFDocument.load(await buildCardsPdf([round(1, 3)]), { updateMetadata: false });
  assert.equal(doc.getAuthor(), undefined);
  assert.equal(doc.getProducer(), undefined);
  assert.equal(doc.getCreator(), undefined);
  assert.equal(doc.getCreationDate(), undefined);
  assert.equal(doc.getModificationDate(), undefined);
});

test('la misma entrada produce exactamente los mismos bytes', async () => {
  const input = [round(1, 10), round(2, 10), round(3, 10)];
  const a = await buildCardsPdf(input);
  const b = await buildCardsPdf(input);
  assert.deepEqual(a, b);
});

test('acepta acentos, eñes y signos de apertura', async () => {
  await buildCardsPdf([{ round: 1, cards: [{ recipient: 'Inés Peña', text: '¿Quién soy? ¡Ñandú!' }] }]);
});

test('acepta una pista de 200 caracteres con palabras normales', async () => {
  const text = 'abcde '.repeat(33).trim().slice(0, MAX_CLUE_LENGTH);
  assert.equal(await checkClue(text), null);
});

test('la letra de la pista es de al menos 12 pt', () => {
  assert.ok(LAYOUT.clueFontSize >= 12);
});

test('rechaza pistas vacías, largas, con emojis o que no entran', async () => {
  assert.match(await checkClue('   '), /vacía/);
  assert.match(await checkClue('a '.repeat(150)), /supera/);
  assert.match(await checkClue('Hola 🎄'), /imprimir/);
  assert.equal(await checkClue('palabra '.repeat(24).trim()), null); // 191 caracteres cortos: entra en 8 líneas
  const longWords = 'wwwwwwwwww '.repeat(18).trim(); // 197 caracteres, una palabra ancha por línea → 18 líneas
  assert.ok(longWords.length <= MAX_CLUE_LENGTH);
  assert.match(await checkClue(longWords), /no entra/);
  assert.match(await checkClue('x'.repeat(60)), /no entra/); // una palabra más ancha que el panel
});

test('buildCardsPdf lanza error ante una pista inválida', async () => {
  await assert.rejects(buildCardsPdf([{ round: 1, cards: [card(1, 'Hola 🎄')] }]), /imprimir/);
});

test('shuffle devuelve una permutación y no modifica la entrada', () => {
  const input = Array.from({ length: 30 }, (_, i) => i);
  const copy = [...input];
  const out = shuffle(input);
  assert.deepEqual(input, copy);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
});
