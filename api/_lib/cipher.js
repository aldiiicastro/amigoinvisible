import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM. El dato cifrado queda atado a un contexto (`aad`, por ejemplo el id de quien regala):
// si alguien copia un valor cifrado a otra fila, el descifrado falla.
// Formato guardado: base64( iv[12] | tag[16] | cifrado ).

export function createCipher(keyBase64) {
  const key = Buffer.from(String(keyBase64 ?? ''), 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY debe ser una clave de 32 bytes codificada en base64.');
  }

  return {
    encrypt(plaintext, aad) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(String(aad)));
      const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
    },

    decrypt(blob, aad) {
      const raw = Buffer.from(String(blob), 'base64');
      if (raw.length < 29) throw new Error('Dato cifrado inválido.');
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAAD(Buffer.from(String(aad)));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}

// Cifrador de producción: lee la clave de la variable de entorno recién cuando se usa.
let fromEnv;
const envCipher = () => (fromEnv ??= createCipher(process.env.DATA_ENCRYPTION_KEY));

export default {
  encrypt: (plaintext, aad) => envCipher().encrypt(plaintext, aad),
  decrypt: (blob, aad) => envCipher().decrypt(blob, aad),
};
