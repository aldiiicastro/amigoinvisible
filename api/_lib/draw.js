import { shuffle } from './random.js';

export const MIN_PLAYERS = 3;

/**
 * Sorteo uniforme: se mezcla la lista de receptores con aleatoriedad criptográfica y se descarta
 * toda mezcla en la que alguien se regale a sí mismo (o incumpla una restricción).
 * Cada sorteo válido tiene la misma probabilidad; en promedio hacen falta ~2,7 intentos.
 *
 * `isAllowed(giver, recipient)` permite sumar exclusiones a futuro (por ejemplo, dos parejas).
 *
 * @param {string[]} ids ids de los participantes
 * @returns {{giver: string, recipient: string}[]}
 */
export function drawAssignments(ids, { isAllowed = () => true, maxAttempts = 10_000, shuffleFn = shuffle } = {}) {
  if (new Set(ids).size !== ids.length) throw new Error('Hay participantes repetidos.');
  if (ids.length < MIN_PLAYERS) throw new Error(`Se necesitan al menos ${MIN_PLAYERS} participantes.`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const recipients = shuffleFn(ids);
    const valid = ids.every((giver, i) => giver !== recipients[i] && isAllowed(giver, recipients[i]));
    if (valid) return ids.map((giver, i) => ({ giver, recipient: recipients[i] }));
  }
  throw new Error('No se encontró un sorteo válido con las restricciones indicadas.');
}

/** Verifica las reglas del sorteo: uno por cabeza, nadie repetido y nadie se regala a sí mismo. */
export function isValidAssignment(ids, pairs) {
  if (pairs.length !== ids.length) return false;
  const givers = new Set(pairs.map((p) => p.giver));
  const recipients = new Set(pairs.map((p) => p.recipient));
  const expected = new Set(ids);
  return (
    givers.size === ids.length &&
    recipients.size === ids.length &&
    ids.every((id) => givers.has(id) && recipients.has(id)) &&
    pairs.every((p) => p.giver !== p.recipient) &&
    givers.size === expected.size
  );
}
