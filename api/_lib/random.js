import { randomInt } from 'node:crypto';

/** Mezcla uniforme (Fisher-Yates) con aleatoriedad criptográfica. Devuelve una copia. */
export function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
