export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No pudimos conectarnos. Revisá tu internet e intentá de nuevo.', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // respuesta sin cuerpo JSON
  }
  if (!res.ok) throw new ApiError(data?.error ?? 'No se pudo completar la acción. Probá de nuevo.', res.status);
  return data;
}

export const api = {
  getEvent: () => request('GET', '/api/event'),
  createEvent: (payload) => request('POST', '/api/event', payload),
  deleteEvent: () => request('DELETE', '/api/event'),
  addParticipant: (payload) => request('POST', '/api/participants', payload),
  updateParticipant: (payload) => request('PATCH', '/api/participants', payload),
  removeParticipant: (id) => request('DELETE', `/api/participants?id=${encodeURIComponent(id)}`),
  recover: (code) => request('POST', '/api/recover', { code }),
  newRecoveryCode: () => request('POST', '/api/recovery-code', {}),
};
