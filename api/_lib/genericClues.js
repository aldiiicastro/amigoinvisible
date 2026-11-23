import { shuffle } from './random.js';

// Pistas de relleno para quien no llegó a confirmar las suyas. Ambiguas a propósito: no delatan a nadie
// y sirven para cualquier persona. Sin géneros ni nombres.
export const GENERIC_CLUES = [
  'No soy la persona que está leyendo esta tarjeta.',
  'Nos conocemos desde hace bastante tiempo.',
  'Estuve en la última reunión de la familia.',
  'Alguna vez me viste con cara de no haber dormido.',
  'Mi nombre no es el que estás pensando.',
  'Hoy estoy más cerca de lo que creés.',
  'Sé guardar secretos, casi siempre.',
  'Seguro nos reímos juntos más de una vez.',
  'Tengo una opinión sobre todo, aunque nadie me la pida.',
  'Seguro me viste comer algo que no debía.',
  'Alguna vez llegué tarde y dije que fue por el tránsito.',
  'En las fiestas me quedo hasta que se apaga la última luz.',
  'Tengo más de una historia que nadie cuenta.',
  'No soy quien más habla en las reuniones, ni quien menos.',
  'Seguro me pediste un favor alguna vez.',
  'Ya sabés quién soy. O no.',
  'Estoy más cerca de vos de lo que parece.',
  'Hice un chiste que nadie entendió y lo repetí igual.',
  'Me cuesta elegir qué comer cuando hay mucho para elegir.',
  'Si sobra torta, yo sé dónde está.',
  'Te saludé hace poco, pero capaz no te acordás.',
  'No tengo ningún apodo secreto. Creo.',
  'Alguna vez me dormí en un sillón ajeno.',
  'Tengo una historia vergonzosa que prefiero no contar.',
];

/**
 * Devuelve `count` pistas distintas de relleno, sin repetir entre sí mientras alcancen.
 * `pool` es un mazo mezclado que se va consumiendo entre llamadas (si se acaba, se vuelve a mezclar).
 */
export function createGenericDeck(shuffleFn = shuffle) {
  let deck = [];
  return function draw(count) {
    const out = [];
    while (out.length < count) {
      if (deck.length === 0) deck = shuffleFn([...GENERIC_CLUES]);
      const next = deck.pop();
      if (!out.includes(next)) out.push(next);
    }
    return out;
  };
}
