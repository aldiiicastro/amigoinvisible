import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './http.js';
import { eventMethods, participantMethods, recoverMethods, recoveryCodeMethods } from './handlers.js';
import { createMemoryStore } from './memoryStore.js';
import { sha256 } from './auth.js';

let store;
let api;

beforeEach(() => {
  store = createMemoryStore();
  api = {
    event: createHandler(eventMethods, { store }),
    participants: createHandler(participantMethods, { store }),
    recover: createHandler(recoverMethods, { store }),
    recoveryCode: createHandler(recoveryCodeMethods, { store }),
  };
});

function makeRes() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

async function call(handler, { method = 'GET', body, cookie, query = {}, contentType } = {}) {
  const req = {
    method,
    query,
    body,
    headers: {
      'x-forwarded-proto': 'https',
      ...(method !== 'GET' ? { 'content-type': contentType ?? 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
  };
  const res = makeRes();
  await handler(req, res);
  return res;
}

const sessionOf = (res) => String(res.headers['Set-Cookie'][0]).split(';')[0];

const NEW_EVENT = { eventName: 'Navidad 2026', adminName: 'Aldana', adminPhone: '11 2345 6789' };

async function createEvent() {
  const res = await call(api.event, { method: 'POST', body: NEW_EVENT });
  assert.equal(res.statusCode, 201);
  return { cookie: sessionOf(res), recoveryCode: res.body.recoveryCode };
}

// --- Evento y acceso -----------------------------------------------------------------------------------------------

test('sin evento: GET informa no_event', async () => {
  const res = await call(api.event);
  assert.deepEqual(res.body, { state: 'no_event' });
});

test('crear evento: devuelve código de recuperación, cookie segura y a la administradora como participante', async () => {
  const res = await call(api.event, { method: 'POST', body: NEW_EVENT });
  assert.equal(res.statusCode, 201);
  assert.match(res.body.recoveryCode, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  const cookie = String(res.headers['Set-Cookie'][0]);
  for (const attr of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/api']) assert.ok(cookie.includes(attr), attr);

  const state = await call(api.event, { cookie: sessionOf(res) });
  assert.equal(state.body.state, 'ok');
  assert.equal(state.body.participants.length, 1);
  assert.equal(state.body.participants[0].isAdmin, true);
  assert.equal(state.body.participants[0].phone, '5491123456789');
});

test('solo se puede crear un evento', async () => {
  await createEvent();
  const again = await call(api.event, { method: 'POST', body: NEW_EVENT });
  assert.equal(again.statusCode, 409);
});

test('sin sesión válida, GET no filtra nada del evento ni de los participantes', async () => {
  await createEvent();
  for (const cookie of [undefined, 'ai_admin=inventado', 'ai_admin=']) {
    const res = await call(api.event, { cookie });
    assert.deepEqual(res.body, { state: 'needs_access' });
  }
});

test('la base guarda solo hashes: ni el token de sesión ni el código de recuperación en claro', async () => {
  const { cookie, recoveryCode } = await createEvent();
  const token = cookie.split('=')[1];
  const stored = JSON.stringify(store._db.events[0]);
  assert.ok(!stored.includes(token));
  assert.ok(!stored.includes(recoveryCode));
  assert.ok(!stored.includes(recoveryCode.replaceAll('-', '')));
  assert.equal(store._db.events[0].admin_token_hash, sha256(token));
});

test('la respuesta de GET no incluye hashes ni ids del evento', async () => {
  const { cookie } = await createEvent();
  const res = await call(api.event, { cookie });
  const text = JSON.stringify(res.body);
  assert.ok(!text.includes('hash'));
  assert.deepEqual(Object.keys(res.body.event).sort(), ['name', 'releaseAt', 'status']);
});

test('validaciones al crear: nombre del evento, nombre con emoji y celular', async () => {
  for (const body of [
    { ...NEW_EVENT, eventName: '  ' },
    { ...NEW_EVENT, adminName: 'Aldana 🎄' },
    { ...NEW_EVENT, adminName: '' },
    { ...NEW_EVENT, adminPhone: '123' },
  ]) {
    const res = await call(api.event, { method: 'POST', body });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.equal(await store.countEvents(), 0);
});

// --- Participantes -------------------------------------------------------------------------------------------------

test('participantes: sin sesión no se puede agregar, editar ni borrar', async () => {
  const { cookie } = await createEvent();
  const added = await call(api.participants, { method: 'POST', cookie, body: { name: 'Bruno', phone: '11 1111 1111' } });
  const id = added.body.participant.id;

  for (const cookieValue of [undefined, 'ai_admin=falsa']) {
    const post = await call(api.participants, { method: 'POST', cookie: cookieValue, body: { name: 'Carla', phone: '11 2222 2222' } });
    const patch = await call(api.participants, { method: 'PATCH', cookie: cookieValue, body: { id, name: 'X', phone: '11 2222 2222' } });
    const del = await call(api.participants, { method: 'DELETE', cookie: cookieValue, query: { id } });
    assert.deepEqual([post.statusCode, patch.statusCode, del.statusCode], [401, 401, 401]);
  }
  assert.equal((await call(api.event, { cookie })).body.participants.length, 2);
});

test('participantes: alta, edición y baja', async () => {
  const { cookie } = await createEvent();
  const add = await call(api.participants, { method: 'POST', cookie, body: { name: ' Bruno  Paz ', phone: '+54 9 11 1111 1111' } });
  assert.equal(add.statusCode, 201);
  assert.equal(add.body.participant.name, 'Bruno Paz');
  const id = add.body.participant.id;

  const edit = await call(api.participants, { method: 'PATCH', cookie, body: { id, name: 'Bruno P.', phone: '11 3333 3333' } });
  assert.equal(edit.statusCode, 200);
  assert.equal(edit.body.participant.phone, '5491133333333');

  const del = await call(api.participants, { method: 'DELETE', cookie, query: { id } });
  assert.equal(del.statusCode, 200);
  assert.equal((await call(api.event, { cookie })).body.participants.length, 1);
});

test('participantes: nombres repetidos (sin importar acentos ni mayúsculas) se rechazan', async () => {
  const { cookie } = await createEvent();
  await call(api.participants, { method: 'POST', cookie, body: { name: 'Inés', phone: '11 1111 1111' } });
  for (const name of ['ines', 'INÉS', 'aldana']) {
    const res = await call(api.participants, { method: 'POST', cookie, body: { name, phone: '11 2222 2222' } });
    assert.equal(res.statusCode, 409, name);
  }
});

test('participantes: editar sin cambiar el nombre no cuenta como repetido', async () => {
  const { cookie } = await createEvent();
  const add = await call(api.participants, { method: 'POST', cookie, body: { name: 'Bruno', phone: '11 1111 1111' } });
  const res = await call(api.participants, {
    method: 'PATCH',
    cookie,
    body: { id: add.body.participant.id, name: 'Bruno', phone: '11 4444 4444' },
  });
  assert.equal(res.statusCode, 200);
});

test('participantes: validaciones de nombre y celular', async () => {
  const { cookie } = await createEvent();
  for (const body of [
    { name: '', phone: '11 1111 1111' },
    { name: 'x'.repeat(41), phone: '11 1111 1111' },
    { name: 'Ana 🎅', phone: '11 1111 1111' },
    { name: 'Ana', phone: '' },
    { name: 'Ana', phone: '11 15 1111 1111' },
  ]) {
    const res = await call(api.participants, { method: 'POST', cookie, body });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
});

test('participantes: máximo de 40', async () => {
  const { cookie } = await createEvent();
  for (let i = 1; i < 40; i++) {
    const res = await call(api.participants, { method: 'POST', cookie, body: { name: `Persona ${i}`, phone: '11 1111 1111' } });
    assert.equal(res.statusCode, 201);
  }
  const over = await call(api.participants, { method: 'POST', cookie, body: { name: 'Una más', phone: '11 1111 1111' } });
  assert.equal(over.statusCode, 409);
});

test('la administradora puede editarse pero no quitarse', async () => {
  const { cookie } = await createEvent();
  const list = (await call(api.event, { cookie })).body.participants;
  const admin = list.find((p) => p.isAdmin);
  const edit = await call(api.participants, { method: 'PATCH', cookie, body: { id: admin.id, name: 'Aldana C.', phone: '11 2345 6789' } });
  assert.equal(edit.statusCode, 200);
  const del = await call(api.participants, { method: 'DELETE', cookie, query: { id: admin.id } });
  assert.equal(del.statusCode, 400);
});

test('participantes: id inexistente → 404', async () => {
  const { cookie } = await createEvent();
  const patch = await call(api.participants, { method: 'PATCH', cookie, body: { id: 'no-existe', name: 'X', phone: '11 1111 1111' } });
  const del = await call(api.participants, { method: 'DELETE', cookie, query: { id: 'no-existe' } });
  assert.deepEqual([patch.statusCode, del.statusCode], [404, 404]);
});

test('después del sorteo no se puede modificar a los participantes ni borrar el evento', async () => {
  const { cookie } = await createEvent();
  const add = await call(api.participants, { method: 'POST', cookie, body: { name: 'Bruno', phone: '11 1111 1111' } });
  const id = add.body.participant.id;
  store._db.events[0].status = 'drawn';

  const post = await call(api.participants, { method: 'POST', cookie, body: { name: 'Carla', phone: '11 2222 2222' } });
  const patch = await call(api.participants, { method: 'PATCH', cookie, body: { id, name: 'Bruno', phone: '11 3333 3333' } });
  const del = await call(api.participants, { method: 'DELETE', cookie, query: { id } });
  const delEvent = await call(api.event, { method: 'DELETE', cookie });
  assert.deepEqual([post.statusCode, patch.statusCode, del.statusCode, delEvent.statusCode], [409, 409, 409, 409]);
});

// --- Borrar evento -------------------------------------------------------------------------------------------------

test('borrar evento en preparación: limpia todo y se puede crear otro', async () => {
  const { cookie } = await createEvent();
  const res = await call(api.event, { method: 'DELETE', cookie });
  assert.equal(res.statusCode, 200);
  assert.ok(String(res.headers['Set-Cookie'][0]).includes('Max-Age=0'));
  assert.equal(store._db.events.length, 0);
  assert.equal(store._db.participants.length, 0);
  assert.equal((await call(api.event, { method: 'POST', body: NEW_EVENT })).statusCode, 201);
});

test('borrar evento sin sesión → 401 y no borra nada', async () => {
  await createEvent();
  const res = await call(api.event, { method: 'DELETE' });
  assert.equal(res.statusCode, 401);
  assert.equal(store._db.events.length, 1);
});

// --- Recuperación --------------------------------------------------------------------------------------------------

test('recuperar acceso: código correcto da sesión nueva e invalida la anterior', async () => {
  const { cookie: oldCookie, recoveryCode } = await createEvent();
  const res = await call(api.recover, { method: 'POST', body: { code: recoveryCode.toLowerCase().replaceAll('-', ' ') } });
  assert.equal(res.statusCode, 200);
  const newCookie = sessionOf(res);
  assert.notEqual(newCookie, oldCookie);
  assert.equal((await call(api.event, { cookie: newCookie })).body.state, 'ok');
  assert.equal((await call(api.event, { cookie: oldCookie })).body.state, 'needs_access');
});

test('recuperar acceso: códigos incorrectos o mal formados → 401 sin dar pistas', async () => {
  await createEvent();
  const wrong = await call(api.recover, { method: 'POST', body: { code: 'AAAA-AAAA-AAAA-AAAA' } });
  const short = await call(api.recover, { method: 'POST', body: { code: 'ABC' } });
  const empty = await call(api.recover, { method: 'POST', body: {} });
  assert.deepEqual([wrong.statusCode, short.statusCode, empty.statusCode], [401, 401, 401]);
  assert.equal(wrong.body.error, short.body.error);
  assert.equal(wrong.headers['Set-Cookie'], undefined);
});

test('código nuevo: el anterior deja de servir y requiere sesión', async () => {
  const { cookie, recoveryCode } = await createEvent();
  assert.equal((await call(api.recoveryCode, { method: 'POST', body: {} })).statusCode, 401);

  const fresh = await call(api.recoveryCode, { method: 'POST', cookie, body: {} });
  assert.equal(fresh.statusCode, 200);
  assert.notEqual(fresh.body.recoveryCode, recoveryCode);
  assert.equal((await call(api.recover, { method: 'POST', body: { code: recoveryCode } })).statusCode, 401);
  assert.equal((await call(api.recover, { method: 'POST', body: { code: fresh.body.recoveryCode } })).statusCode, 200);
});

// --- Protocolo -----------------------------------------------------------------------------------------------------

test('las modificaciones exigen JSON (defensa contra CSRF)', async () => {
  const res = await call(api.event, { method: 'POST', body: NEW_EVENT, contentType: 'text/plain' });
  assert.equal(res.statusCode, 415);
  assert.equal(await store.countEvents(), 0);
});

test('métodos no permitidos → 405 y las respuestas no se cachean', async () => {
  const res = await call(api.recover, { method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
