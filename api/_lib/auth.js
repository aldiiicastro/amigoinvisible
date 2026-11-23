import { createHash, randomBytes, randomInt } from 'node:crypto';

export const SESSION_COOKIE = 'ai_admin';
const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 días: más que lo que dura el evento

// Sin I, L, O, 0 ni 1 para que no se confundan al copiarlo a mano. 16 símbolos de 31 ≈ 79 bits.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 16;

/** Token aleatorio de 32 bytes. Solo se guarda su hash. */
export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Código de recuperación legible: XXXX-XXXX-XXXX-XXXX. */
export function newRecoveryCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code.match(/.{4}/g).join('-');
}

/** Acepta el código con o sin guiones, espacios y en minúsculas. */
export function normalizeRecoveryCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isValidRecoveryCodeShape(normalized) {
  return normalized.length === CODE_LENGTH;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function tokenFromRequest(req) {
  return parseCookies(req.headers?.cookie)[SESSION_COOKIE] || null;
}

/** Secure salvo que el proxy diga explícitamente que es http (desarrollo local). */
export function isSecureRequest(req) {
  return req.headers?.['x-forwarded-proto'] !== 'http';
}

// Path=/api: el navegador solo manda la cookie a las funciones, nunca a las páginas.
export function sessionCookie(token, req) {
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}${
    isSecureRequest(req) ? '; Secure' : ''
  }`;
}

export function clearSessionCookie(req) {
  return `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${isSecureRequest(req) ? '; Secure' : ''}`;
}
