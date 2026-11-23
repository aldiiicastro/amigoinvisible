export const MAX_PARTICIPANTS = 40;
export const MAX_EVENT_NAME_LENGTH = 60;

const PHONE_HELP = 'Ingresá el celular con código de área, sin 0 ni 15. Ejemplo: 11 2345 6789.';

/** Colapsa espacios y recorta. */
export function normalizeName(input) {
  return String(input ?? '').replace(/\s+/g, ' ').trim();
}

/** Clave para detectar nombres repetidos sin importar mayúsculas ni acentos. */
export function nameKey(name) {
  return normalizeName(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** @returns {{value: string} | {error: string}} */
export function validateEventName(input) {
  const value = normalizeName(input);
  if (!value) return { error: 'Poné un nombre para el evento.' };
  if (value.length > MAX_EVENT_NAME_LENGTH) {
    return { error: `El nombre del evento supera los ${MAX_EVENT_NAME_LENGTH} caracteres.` };
  }
  return { value };
}

/**
 * Normaliza un celular a solo dígitos con código de país, listo para wa.me.
 * Sin "+" se asume Argentina (10 dígitos: área + número, sin 0 ni 15). Con "+" de otro país se aceptan 8 a 15 dígitos.
 * @returns {{value: string} | {error: string}}
 */
export function parsePhone(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { error: 'Falta el número de WhatsApp.' };
  if (/[^\d\s()+\-.]/.test(raw)) return { error: 'El número solo puede tener dígitos, espacios, guiones y +.' };

  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (hasPlus && !digits.startsWith('54')) {
    return digits.length >= 8 && digits.length <= 15 ? { value: digits } : { error: PHONE_HELP };
  }
  if (digits.startsWith('54') && digits.length >= 12) {
    if (digits.length === 12) return { value: `549${digits.slice(2)}` };
    if (digits.length === 13 && digits[2] === '9') return { value: digits };
    return { error: PHONE_HELP };
  }
  if (digits.length === 10) return { value: `549${digits}` };
  return { error: PHONE_HELP };
}
