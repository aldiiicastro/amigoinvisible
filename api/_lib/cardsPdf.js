import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Geometría en milímetros. A4 vertical. Cada tarjeta es una tira de 90×90 mm con un pliegue horizontal al medio:
//   panel de arriba  = exterior ("Pista 1:" + nombre del destinatario)
//   panel de abajo   = interior (la pista); se dobla hacia atrás, detrás del panel de arriba.
// Cerrada mide 90×45 mm.
export const LAYOUT = {
  page: { w: 210, h: 297 },
  card: { w: 90, h: 90 },
  cols: 2,
  rows: 3,
  marginX: 15,
  marginTop: 14, // deja lugar para el título de la ronda
  padX: 5,
  padY: 4,
  clueFontSize: 12,
  clueLineHeight: 14.4, // pt
  labelFontSize: 12,
  nameFontSize: 20,
  nameMinFontSize: 12,
};
export const MAX_CLUE_LENGTH = 200;
export const CARDS_PER_PAGE = LAYOUT.cols * LAYOUT.rows;

const MM = 72 / 25.4;
const mm = (v) => v * MM;
const GRAY_CUT = rgb(0.55, 0.55, 0.55);
const GRAY_FOLD = rgb(0.78, 0.78, 0.78);
const BLACK = rgb(0, 0, 0);

const panelW = () => mm(LAYOUT.card.w) - 2 * mm(LAYOUT.padX);
const panelH = () => mm(LAYOUT.card.h) / 2;
const maxClueLines = () => Math.floor((panelH() - 2 * mm(LAYOUT.padY)) / LAYOUT.clueLineHeight);

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
  const lines = wrap(text, font, LAYOUT.clueFontSize, panelW());
  if (!lines || lines.length > maxClueLines()) {
    return 'La pista no entra en la tarjeta: acortala o separá las palabras muy largas.';
  }
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

/** Dibuja líneas de texto centradas verticalmente en un panel; `x` calcula la posición horizontal de cada línea. */
function drawBlock(page, lines, { font, size, lineHeight, panelTop, x }) {
  const blockH = lines.length * lineHeight;
  const top = panelTop - (panelH() - blockH) / 2;
  lines.forEach((line, i) => {
    const centerY = top - (i + 0.5) * lineHeight;
    page.drawText(line, { x: x(line), y: centerY - size * 0.35, size, font, color: BLACK });
  });
}

function drawCard(page, fonts, card, round, left, top) {
  const w = mm(LAYOUT.card.w);
  const h = mm(LAYOUT.card.h);
  const innerW = panelW();
  const middle = top - h / 2;

  // Panel de arriba (exterior): "Pista N:" y el nombre, centrados. El nombre baja de tamaño solo si es larguísimo.
  let nameSize = LAYOUT.nameFontSize;
  let nameLines = wrap(card.recipient, fonts.bold, nameSize, innerW);
  while (!nameLines && nameSize > LAYOUT.nameMinFontSize) {
    nameSize -= 1;
    nameLines = wrap(card.recipient, fonts.bold, nameSize, innerW);
  }
  if (!nameLines) throw new Error('Un nombre es demasiado largo para la tarjeta.');

  const label = `Pista ${round}:`;
  const labelH = LAYOUT.labelFontSize * 1.5;
  const nameLH = nameSize * 1.2;
  const blockH = labelH + nameLines.length * nameLH;
  let y = top - (panelH() - blockH) / 2;

  const labelW = fonts.regular.widthOfTextAtSize(label, LAYOUT.labelFontSize);
  page.drawText(label, {
    x: left + w / 2 - labelW / 2,
    y: y - labelH / 2 - LAYOUT.labelFontSize * 0.35,
    size: LAYOUT.labelFontSize,
    font: fonts.regular,
    color: BLACK,
  });
  y -= labelH;
  nameLines.forEach((line, i) => {
    const lw = fonts.bold.widthOfTextAtSize(line, nameSize);
    page.drawText(line, {
      x: left + w / 2 - lw / 2,
      y: y - (i + 0.5) * nameLH - nameSize * 0.35,
      size: nameSize,
      font: fonts.bold,
      color: BLACK,
    });
  });

  // Panel de abajo (interior): la pista, alineada a la izquierda y centrada verticalmente.
  const clueLines = wrap(card.text, fonts.regular, LAYOUT.clueFontSize, innerW);
  if (!clueLines || clueLines.length > maxClueLines()) {
    throw new Error('Una pista es demasiado larga para entrar en la tarjeta.');
  }
  drawBlock(page, clueLines, {
    font: fonts.regular,
    size: LAYOUT.clueFontSize,
    lineHeight: LAYOUT.clueLineHeight,
    panelTop: middle,
    x: () => left + mm(LAYOUT.padX),
  });

  // Pliegue (clarito) al medio de la tira.
  drawDashed(page, left, middle, left + w, middle, GRAY_FOLD, 0.3);
}

function drawCutGrid(page, originX, originTop) {
  const { card, cols, rows } = LAYOUT;
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

  const { page: pageSize, card, cols, marginX, marginTop } = LAYOUT;
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
      drawCutGrid(page, originX, originTop);

      chunk.forEach((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        drawCard(page, fonts, c, round, originX + col * mm(card.w), originTop - row * mm(card.h));
      });
    }
  }

  return doc.save();
}
