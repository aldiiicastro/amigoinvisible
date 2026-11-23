export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireJson(req) {
  const type = String(req.headers?.['content-type'] ?? '').toLowerCase();
  // Exigir JSON obliga a una petición "preflight" desde otros sitios, que no permitimos: frena el CSRF.
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Se esperaba JSON.');
}

/**
 * Arma una función de Vercel a partir de un mapa método → handler.
 * Cada handler recibe { req, body, store } y devuelve { status?, body?, cookies? }.
 * `store` y `cipher` se inyectan en los tests; en producción se usan Supabase y la clave de entorno.
 */
export function createHandler(methods, { store, cipher } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const fn = methods[req.method];
      if (!fn) {
        res.setHeader('Allow', Object.keys(methods).join(', '));
        throw new HttpError(405, 'Método no permitido.');
      }
      if (req.method !== 'GET') requireJson(req);

      let body;
      try {
        body = req.body ?? {};
      } catch {
        throw new HttpError(400, 'El cuerpo de la solicitud no es JSON válido.');
      }
      if (body === null || typeof body !== 'object') throw new HttpError(400, 'El cuerpo de la solicitud no es JSON válido.');

      const resolvedStore = store ?? (await import('./store.js')).default;
      const resolvedCipher = cipher ?? (await import('./cipher.js')).default;
      const result = await fn({ req, body, store: resolvedStore, cipher: resolvedCipher });
      if (result.cookies?.length) res.setHeader('Set-Cookie', result.cookies);
      if (result.file) {
        res.setHeader('Content-Type', result.file.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.file.filename}"`);
        res.status(200).send(Buffer.from(result.file.data));
        return;
      }
      res.status(result.status ?? 200).json(result.body ?? {});
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error('api error:', err?.message ?? err);
      res.status(500).json({ error: 'Ocurrió un error inesperado. Probá de nuevo.' });
    }
  };
}
