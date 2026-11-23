import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Geometría en milímetros. A4 vertical, tira de 95×45 mm con un pliegue al medio.
export const LAYOUT = {
  page: { w: 210, h: 297 },
  card: { w: 95, h: 45 },
  cols: 2,
  rows: 6,
  marginX: 10,
  marginTop: 14, // deja lugar para el título de la ronda
  padding: 3.5,
  clueFontSize: 9,
  clueLineHeight: 11, // pt
};
export const MAX_CLUE_LENGTH = 200;
export const CARDS_PER_PAGE = LAYOUT.cols * LAYOUT.rows;

const MM = 72 / 25.4;
const mm = (v) => v * MM;
const GRAY_CUT = rgb(0.55, 0.55, 0.55);
const GRAY_FOLD = rgb(0.78, 0.78, 0.78);
const BLACK = rgb(0, 0, 0);

/** Texto en una sola línea lógica; los saltos de línea y espacios repetidos se colapsan. */
export function normalizeText(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/** Parte `text` en líneas que no superen `maxWidth` (pt). Devuelve null si una palabra no entra sola. */
function wrap(text, font, size, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (font.widthOfTextAtSize(word, size) > maxWidth) return null;
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function assertEncodable(font, text, what) {
  try {
    font.encodeText(text);
  } catch {
    throw new Error(`${what} contiene caracteres que no se pueden imprimir (emojis o símbolos).`);
  }
}

/** Devuelve un mensaje (en español) si la pista no se puede imprimir en la tarjeta, o null si está bien. */
function clueProblem(font, rawText) {
  const text = normalizeText(rawText);
  if (!text) return 'La pista está vacía.';
  if (text.length > MAX_CLUE_LENGTH) return `La pista supera los ${MAX_CLUE_LENGTH} caracteres.`;
  try {
    font.encodeText(text);
  } catch {
    return 'La pista tiene caracteres que no se pueden imprimir (emojis o símbolos).';
  }
  const textW = mm(LAYOUT.card.w) / 2 - 2 * mm(LAYOUT.padding);
  const lines = wrap(text, font, LAYOUT.clueFontSize, textW);
  const maxLines = Math.floor((mm(LAYOUT.card.h) - 2 * mm(LAYOUT.padding)) / LAYOUT.clueLineHeight);
  if (!lines || lines.length > maxLines) return 'La pista no entra en la tarjeta: acortala o separá las palabras muy largas.';
  return null;
}

let measureFont;
/** Validación para el backend (borrador y confirmación). Devuelve un mensaje o null. */
export async function checkClue(text) {
  measureFont ??= PDFDocument.create({ updateMetadata: false }).then((d) => d.embedFont(StandardFonts.Helvetica));
  return clueProblem(await measureFont, text);
}

function drawDashed(page, x1, y1, x2, y2, color, thickness = 0.4) {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    color,
    thickness,
    dashArray: [2, 2.5],
  });
}

function drawRoundDots(page, round, x, y) {
  const r = 1.6;
  for (let i = 0; i < round; i++) {
    page.drawCircle({ x: x + i * 6, y, size: r, color: BLACK });
  }
}

function drawCard(page, fonts, card, round, left, top) {
  const { card: size, padding } = LAYOUT;
  const w = mm(size.w);
  const h = mm(size.h);
  const panelW = w / 2;
  const pad = mm(padding);
  const textW = panelW - 2 * pad;
  const bottom = top - h;

  // Panel izquierdo (exterior): nombre del destinatario, centrado, tamaño fijo salvo nombres muy largos.
  let nameSize = 13;
  let nameLines = wrap(card.recipient, fonts.bold, nameSize, textW);
  while (!nameLines && nameSize > 8) {
    nameSize -= 1;
    nameLines = wrap(card.recipient, fonts.bold, nameSize, textW);
  }
  if (!nameLines) throw new Error('Un nombre es demasiado largo para la tarjeta.');
  const nameLH = nameSize * 1.2;
  const blockH = nameLines.length * nameLH;
  let y = bottom + h / 2 + blockH / 2 - nameSize;
  for (const line of nameLines) {
    const lw = fonts.bold.widthOfTextAtSize(line, nameSize);
    page.drawText(line, { x: left + panelW / 2 - lw / 2, y, size: nameSize, font: fonts.bold, color: BLACK });
    y -= nameLH;
  }
  drawRoundDots(page, round, left + panelW / 2 - ((round - 1) * 6) / 2, bottom + pad + 2);

  // Panel derecho (interior): la pista.
  const clueLines = wrap(card.text, fonts.regular, LAYOUT.clueFontSize, textW);
  const maxLines = Math.floor((h - 2 * pad) / LAYOUT.clueLineHeight);
  if (!clueLines || clueLines.length > maxLines) {
    throw new Error('Una pista es demasiado larga para entrar en la tarjeta.');
  }
  y = top - pad - LAYOUT.clueFontSize;
  for (const line of clueLines) {
    page.drawText(line, { x: left + panelW + pad, y, size: LAYOUT.clueFontSize, font: fonts.regular, color: BLACK });
    y -= LAYOUT.clueLineHeight;
  }

  // Pliegue (clarito) al medio de la tira.
  drawDashed(page, left + panelW, top, left + panelW, bottom, GRAY_FOLD, 0.3);
}

function drawCutGrid(page, originX, originTop, rows) {
  const { card, cols } = LAYOUT;
  const w = mm(card.w);
  const h = mm(card.h);
  const tick = mm(4);
  for (let r = 0; r <= rows; r++) {
    const y = originTop - r * h;
    drawDashed(page, originX - tick, y, originX + cols * w + tick, y, GRAY_CUT);
  }
  for (let c = 0; c <= cols; c++) {
    const x = originX + c * w;
    drawDashed(page, x, originTop + tick, x, originTop - rows * h - tick, GRAY_CUT);
  }
}

/**
 * Genera el PDF de tarjetas.
 * @param {{round: 1|2|3, cards: {recipient: string, text: string}[]}[]} rounds
 *   Las tarjetas de cada ronda ya vienen en su orden final (mezclado antes de llamar).
 * @returns {Promise<Uint8Array>}
 */
export async function buildCardsPdf(rounds) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle('Tarjetas');
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const { page: pageSize, card, cols, rows, marginX, marginTop } = LAYOUT;
  const pageW = mm(pageSize.w);
  const pageH = mm(pageSize.h);
  const originX = mm(marginX);
  const originTop = pageH - mm(marginTop);

  for (const { round, cards } of rounds) {
    const clean = cards.map((c) => ({ recipient: normalizeText(c.recipient), text: normalizeText(c.text) }));
    for (const c of clean) {
      if (!c.recipient) throw new Error('Hay una tarjeta sin nombre.');
      assertEncodable(fonts.regular, c.recipient, 'Un nombre');
      const problem = clueProblem(fonts.regular, c.text);
      if (problem) throw new Error(problem);
    }

    for (let start = 0; start < clean.length; start += CARDS_PER_PAGE) {
      const chunk = clean.slice(start, start + CARDS_PER_PAGE);
      const page = doc.addPage([pageW, pageH]);

      page.drawText(`Ronda ${round}`, { x: originX, y: pageH - mm(8), size: 9, font: fonts.bold, color: GRAY_CUT });
      drawCutGrid(page, originX, originTop, rows);

      chunk.forEach((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        drawCard(page, fonts, c, round, originX + col * mm(card.w), originTop - row * mm(card.h));
      });
    }
  }

  return doc.save();
}
