import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './http.js';
import {
  cluesMethods,
  drawMethods,
  enterMethods,
  eventMethods,
  inviteMethods,
  meMethods,
  participantMethods,
  recoverMethods,
  recoveryCodeMethods,
} from './handlers.js';
import { createMemoryStore } from './memoryStore.js';
import { createCipher } from './cipher.js';
import { sha256 } from './auth.js';

const cipher = createCipher(Buffer.alloc(32, 7).toString('base64'));

let store;
let api;

beforeEach(() => {
  store = createMemoryStore();
  const make = (methods) => createHandler(methods, { store, cipher });
  api = {
    event: make(eventMethods),
    participants: make(participantMethods),
    recover: make(recoverMethods),
    recoveryCode: make(recoveryCodeMethods),
    draw: make(drawMethods),
    invites: make(inviteMethods),
    enter: make(enterMethods),
    me: make(meMethods),
    clues: make(cluesMethods),
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
  assert.deepEqual(Object.keys(res.body.event).sort(), ['description', 'name', 'releaseAt', 'status']);
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

test('después del sorteo no se puede sumar ni quitar gente, pero sí corregir nombre o celular', async () => {
  const { cookie } = await createEvent();
  const add = await call(api.participants, { method: 'POST', cookie, body: { name: 'Bruno', phone: '11 1111 1111' } });
  const id = add.body.participant.id;
  store._db.events[0].status = 'drawn';

  const post = await call(api.participants, { method: 'POST', cookie, body: { name: 'Carla', phone: '11 2222 2222' } });
  const del = await call(api.participants, { method: 'DELETE', cookie, query: { id } });
  const patch = await call(api.participants, { method: 'PATCH', cookie, body: { id, name: 'Bruno', phone: '11 3333 3333' } });
  assert.deepEqual([post.statusCode, del.statusCode, patch.statusCode], [409, 409, 200]);
});

test('con el evento liberado o cerrado ya no se edita nada', async () => {
  const { cookie } = await createEvent();
  const add = await call(api.participants, { method: 'POST', cookie, body: { name: 'Bruno', phone: '11 1111 1111' } });
  store._db.events[0].status = 'released';
  const patch = await call(api.participants, {
    method: 'PATCH',
    cookie,
    body: { id: add.body.participant.id, name: 'Bruno', phone: '11 3333 3333' },
  });
  const delEvent = await call(api.event, { method: 'DELETE', cookie, query: { confirm: 'BORRAR' } });
  assert.deepEqual([patch.statusCode, delEvent.statusCode], [409, 409]);
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

// --- Sorteo, invitaciones y vista de cada participante -------------------------------------------------------------

const PEOPLE = ['Bruno', 'Carla', 'Diego', 'Elena', 'Facundo'];

/** Evento con la organizadora (Aldana) y los participantes dados. */
async function setupEvent(names = PEOPLE) {
  const { cookie } = await createEvent();
  for (const [i, name] of names.entries()) {
    const res = await call(api.participants, { method: 'POST', cookie, body: { name, phone: `11 ${1000 + i} 0000` } });
    assert.equal(res.statusCode, 201);
  }
  return cookie;
}

async function setupDrawn(names = PEOPLE) {
  const cookie = await setupEvent(names);
  const res = await call(api.draw, { method: 'POST', cookie, body: {} });
  assert.equal(res.statusCode, 200);
  return cookie;
}

const participantsOf = async (cookie) => (await call(api.event, { cookie })).body.participants;

async function newInvite(cookie, participantId) {
  const res = await call(api.invites, { method: 'POST', cookie, body: { participantId } });
  assert.equal(res.statusCode, 200);
  return res.body.token;
}

async function enterWith(token) {
  return call(api.enter, { method: 'POST', body: { token } });
}

test('sorteo: exige sesión de administradora y al menos 3 participantes', async () => {
  const cookie = await setupEvent(['Bruno']); // con Aldana son 2
  assert.equal((await call(api.draw, { method: 'POST', body: {} })).statusCode, 401);
  assert.equal((await call(api.draw, { method: 'POST', cookie, body: {} })).statusCode, 409);
  assert.equal(store._db.events[0].status, 'preparing');
  assert.equal(store._db.assignments.length, 0);
});

test('sorteo: guarda una asignación por participante y no devuelve el resultado', async () => {
  const cookie = await setupEvent();
  const res = await call(api.draw, { method: 'POST', cookie, body: {} });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(store._db.events[0].status, 'drawn');
  assert.equal(store._db.assignments.length, PEOPLE.length + 1);
});

test('sorteo: el destinatario se guarda cifrado, atado a quien regala, y cumple las reglas', async () => {
  await setupDrawn();
  const ids = store._db.participants.map((p) => p.id);
  const recipients = new Map();
  for (const a of store._db.assignments) {
    assert.ok(!ids.some((id) => a.recipient_enc.includes(id)), 'el id no debe verse en claro');
    recipients.set(a.giver_id, cipher.decrypt(a.recipient_enc, a.giver_id));
    assert.throws(() => cipher.decrypt(a.recipient_enc, 'otra-fila'));
  }
  assert.equal(new Set(recipients.values()).size, ids.length); // cada uno recibe exactamente uno
  for (const [giver, recipient] of recipients) {
    assert.ok(ids.includes(recipient));
    assert.notEqual(giver, recipient); // nadie se regala a sí mismo
  }
});

test('sorteo: no se puede repetir ni regenerar', async () => {
  const cookie = await setupDrawn();
  const before = JSON.stringify(store._db.assignments);
  const again = await call(api.draw, { method: 'POST', cookie, body: {} });
  assert.equal(again.statusCode, 409);
  assert.equal(JSON.stringify(store._db.assignments), before);
});

test('después del sorteo, el panel muestra el estado de los enlaces y nada del resultado', async () => {
  const cookie = await setupDrawn();
  const res = await call(api.event, { cookie });
  assert.equal(res.body.event.status, 'drawn');
  const list = res.body.participants;
  assert.equal(list.find((p) => p.isAdmin).invite, undefined);
  assert.ok(list.filter((p) => !p.isAdmin).every((p) => p.invite === 'none'));
  const text = JSON.stringify(res.body).toLowerCase();
  for (const word of ['recipient', 'destinatario', 'assignment', 'giver', '_enc']) assert.ok(!text.includes(word), word);
});

test('enlaces: solo la organizadora, solo después del sorteo y no para ella misma', async () => {
  const cookie = await setupEvent();
  const list = await participantsOf(cookie);
  const bruno = list.find((p) => p.name === 'Bruno');
  const admin = list.find((p) => p.isAdmin);

  const early = await call(api.invites, { method: 'POST', cookie, body: { participantId: bruno.id } });
  assert.equal(early.statusCode, 409); // todavía no hubo sorteo

  await call(api.draw, { method: 'POST', cookie, body: {} });
  assert.equal((await call(api.invites, { method: 'POST', body: { participantId: bruno.id } })).statusCode, 401);
  assert.equal((await call(api.invites, { method: 'POST', cookie, body: { participantId: admin.id } })).statusCode, 400);
  assert.equal((await call(api.invites, { method: 'POST', cookie, body: { participantId: 'nadie' } })).statusCode, 404);
});

test('enlaces: la base guarda solo el hash y el panel pasa a "generated"', async () => {
  const cookie = await setupDrawn();
  const bruno = (await participantsOf(cookie)).find((p) => p.name === 'Bruno');
  const token = await newInvite(cookie, bruno.id);
  assert.ok(token.length >= 40);
  assert.ok(!JSON.stringify(store._db).includes(token));
  assert.equal(store._db.participants.find((p) => p.id === bruno.id).invite_token_hash, sha256(token));
  assert.equal((await participantsOf(cookie)).find((p) => p.id === bruno.id).invite, 'generated');
});

test('canje: el enlace sirve una sola vez, crea una sesión segura y deja de ser válido', async () => {
  const cookie = await setupDrawn();
  const bruno = (await participantsOf(cookie)).find((p) => p.name === 'Bruno');
  const token = await newInvite(cookie, bruno.id);

  const first = await enterWith(token);
  assert.equal(first.statusCode, 200);
  const set = String(first.headers['Set-Cookie'][0]);
  for (const attr of ['ai_part=', 'HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/api']) assert.ok(set.includes(attr), attr);
  assert.ok(!JSON.stringify(store._db).includes(set.split(';')[0].split('=')[1])); // la sesión tampoco se guarda en claro

  const second = await enterWith(token);
  assert.equal(second.statusCode, 404);
  assert.equal(second.headers['Set-Cookie'], undefined);
  assert.equal((await participantsOf(cookie)).find((p) => p.id === bruno.id).invite, 'entered');
});

test('canje: tokens inventados, vacíos o demasiado cortos → 404 sin pistas', async () => {
  await setupDrawn();
  for (const token of [undefined, '', 'abc', 'x'.repeat(43), 'x'.repeat(500)]) {
    const res = await enterWith(token);
    assert.equal(res.statusCode, 404);
  }
});

test('si la organizadora abre un enlace ajeno, la persona se entera: su enlace ya no sirve', async () => {
  const cookie = await setupDrawn();
  const carla = (await participantsOf(cookie)).find((p) => p.name === 'Carla');
  const token = await newInvite(cookie, carla.id);

  assert.equal((await enterWith(token)).statusCode, 200); // lo abre la organizadora
  const victim = await enterWith(token); // después intenta Carla
  assert.equal(victim.statusCode, 404);
  assert.match(victim.body.error, /ya se usó/);
});

test('reemitir un enlace invalida el anterior y cierra la sesión del participante', async () => {
  const cookie = await setupDrawn();
  const diego = (await participantsOf(cookie)).find((p) => p.name === 'Diego');
  const oldToken = await newInvite(cookie, diego.id);
  const oldSession = sessionOf(await enterWith(oldToken));
  assert.equal((await call(api.me, { cookie: oldSession })).body.state, 'ok');

  const newToken = await newInvite(cookie, diego.id);
  assert.equal((await call(api.me, { cookie: oldSession })).body.state, 'no_session');
  assert.equal((await enterWith(oldToken)).statusCode, 404);
  const fresh = await enterWith(newToken);
  assert.equal(fresh.statusCode, 200);
  assert.equal((await call(api.me, { cookie: sessionOf(fresh) })).body.state, 'ok');
});

test('cada participante ve solo a quién le toca; entre todos forman un sorteo válido', async () => {
  const cookie = await setupDrawn();
  const list = await participantsOf(cookie);
  const everyone = list.map((p) => p.name);
  const seen = new Map();

  for (const p of list.filter((x) => !x.isAdmin)) {
    const session = sessionOf(await enterWith(await newInvite(cookie, p.id)));
    const res = await call(api.me, { cookie: session });
    assert.equal(res.body.state, 'ok');
    assert.equal(res.body.me.name, p.name);
    seen.set(p.name, res.body.recipientName);

    // La respuesta no trae ids ni nombres de nadie más que el propio y el de su amigo invisible.
    const text = JSON.stringify(res.body);
    for (const other of everyone.filter((n) => n !== p.name && n !== res.body.recipientName)) assert.ok(!text.includes(other), other);
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(text), 'no deben viajar ids');
  }

  const adminView = await call(api.me, { cookie });
  assert.equal(adminView.body.state, 'ok');
  assert.equal(adminView.body.me.isAdmin, true);
  seen.set('Aldana', adminView.body.recipientName);

  assert.equal(seen.size, everyone.length);
  assert.equal(new Set(seen.values()).size, everyone.length); // cada uno recibe exactamente un regalo
  for (const [giver, recipient] of seen) assert.notEqual(giver, recipient);
});

test('me: sin sesión, con cookie falsa o antes del sorteo no filtra nada', async () => {
  const cookie = await setupEvent();
  assert.deepEqual((await call(api.me)).body, { state: 'no_session' });
  assert.deepEqual((await call(api.me, { cookie: 'ai_part=inventada' })).body, { state: 'no_session' });
  assert.deepEqual((await call(api.me, { cookie: 'ai_admin=inventada' })).body, { state: 'no_session' });
  const admin = await call(api.me, { cookie });
  assert.equal(admin.body.state, 'not_drawn');
  assert.equal(admin.body.recipientName, undefined);
});

test('la cookie de participante no da acceso de administradora', async () => {
  const cookie = await setupDrawn();
  const bruno = (await participantsOf(cookie)).find((p) => p.name === 'Bruno');
  const session = sessionOf(await enterWith(await newInvite(cookie, bruno.id)));

  assert.deepEqual((await call(api.event, { cookie: session })).body, { state: 'needs_access' });
  assert.equal((await call(api.draw, { method: 'POST', cookie: session, body: {} })).statusCode, 401);
  assert.equal((await call(api.invites, { method: 'POST', cookie: session, body: { participantId: bruno.id } })).statusCode, 401);
  assert.equal((await call(api.participants, { method: 'POST', cookie: session, body: { name: 'Intruso', phone: '11 1111 1111' } })).statusCode, 401);
});

test('si se corrige un nombre después del sorteo, el amigo invisible lo ve actualizado', async () => {
  const cookie = await setupDrawn();
  const list = await participantsOf(cookie);
  const bruno = list.find((p) => p.name === 'Bruno');
  const session = sessionOf(await enterWith(await newInvite(cookie, bruno.id)));
  const target = (await call(api.me, { cookie: session })).body.recipientName;
  const targetPerson = list.find((p) => p.name === target);

  await call(api.participants, { method: 'PATCH', cookie, body: { id: targetPerson.id, name: `${target} Z.`, phone: '11 9999 9999' } });
  assert.equal((await call(api.me, { cookie: session })).body.recipientName, `${target} Z.`);
});

test('borrar un evento ya sorteado exige confirmación explícita y limpia todo', async () => {
  const cookie = await setupDrawn();
  const bruno = (await participantsOf(cookie)).find((p) => p.name === 'Bruno');
  const session = sessionOf(await enterWith(await newInvite(cookie, bruno.id)));

  assert.equal((await call(api.event, { method: 'DELETE', cookie })).statusCode, 409);
  assert.equal((await call(api.event, { method: 'DELETE', cookie, query: { confirm: 'si' } })).statusCode, 409);
  assert.equal(store._db.events.length, 1);

  assert.equal((await call(api.event, { method: 'DELETE', cookie, query: { confirm: 'BORRAR' } })).statusCode, 200);
  assert.equal(store._db.events.length, 0);
  assert.equal(store._db.assignments.length, 0);
  assert.equal((await call(api.me, { cookie: session })).body.state, 'no_session');
});

// --- Indicaciones del evento y reingreso ---------------------------------------------------------------------------

const DESCRIPTION = 'Tener las pistas listas para el 23 a la noche.\nEl monto máximo a gastar es de $25.000.';

test('indicaciones: la organizadora las guarda y las ve en el panel', async () => {
  const cookie = await setupEvent();
  const empty = await call(api.event, { cookie });
  assert.equal(empty.body.event.description, '');

  const saved = await call(api.event, { method: 'PATCH', cookie, body: { description: `  ${DESCRIPTION}  \n\n\n\n` } });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.description, DESCRIPTION); // recorta y limpia saltos de línea de más
  assert.equal((await call(api.event, { cookie })).body.event.description, DESCRIPTION);
});

test('indicaciones: se pueden vaciar, y se rechaza lo demasiado largo', async () => {
  const cookie = await setupEvent();
  await call(api.event, { method: 'PATCH', cookie, body: { description: 'algo' } });
  const cleared = await call(api.event, { method: 'PATCH', cookie, body: { description: '' } });
  assert.equal(cleared.statusCode, 200);
  assert.equal((await call(api.event, { cookie })).body.event.description, '');

  const tooLong = await call(api.event, { method: 'PATCH', cookie, body: { description: 'x'.repeat(601) } });
  assert.equal(tooLong.statusCode, 400);
});

test('indicaciones: solo la organizadora puede cambiarlas', async () => {
  const cookie = await setupDrawn();
  const bruno = (await participantsOf(cookie)).find((p) => p.name === 'Bruno');
  const session = sessionOf(await enterWith(await newInvite(cookie, bruno.id)));

  const anon = await call(api.event, { method: 'PATCH', body: { description: 'hack' } });
  const asParticipant = await call(api.event, { method: 'PATCH', cookie: session, body: { description: 'hack' } });
  assert.deepEqual([anon.statusCode, asParticipant.statusCode], [401, 401]);
  assert.equal(store._db.events[0].description, '');
});

test('indicaciones: cada participante las ve en su pantalla, también antes del sorteo para la organizadora', async () => {
  const cookie = await setupEvent();
  await call(api.event, { method: 'PATCH', cookie, body: { description: DESCRIPTION } });
  assert.equal((await call(api.me, { cookie })).body.event.description, DESCRIPTION); // not_drawn

  await call(api.draw, { method: 'POST', cookie, body: {} });
  const bruno = (await participantsOf(cookie)).find((p) => p.name === 'Bruno');
  const session = sessionOf(await enterWith(await newInvite(cookie, bruno.id)));
  assert.equal((await call(api.me, { cookie: session })).body.event.description, DESCRIPTION);
});

test('indicaciones: no se filtran sin sesión', async () => {
  const cookie = await setupEvent();
  await call(api.event, { method: 'PATCH', cookie, body: { description: DESCRIPTION } });
  assert.ok(!JSON.stringify((await call(api.event)).body).includes('monto'));
  assert.ok(!JSON.stringify((await call(api.me)).body).includes('monto'));
});

test('me?scope=participant ignora la sesión de la organizadora', async () => {
  const cookie = await setupDrawn();
  const asAdmin = await call(api.me, { cookie });
  assert.equal(asAdmin.body.state, 'ok');
  const scoped = await call(api.me, { cookie, query: { scope: 'participant' } });
  assert.deepEqual(scoped.body, { state: 'no_session' });
});

test('me?scope=participant reconoce a quien ya entró (para no gastar de nuevo su enlace)', async () => {
  const cookie = await setupDrawn();
  const bruno = (await participantsOf(cookie)).find((p) => p.name === 'Bruno');
  const session = sessionOf(await enterWith(await newInvite(cookie, bruno.id)));
  const scoped = await call(api.me, { cookie: session, query: { scope: 'participant' } });
  assert.equal(scoped.body.state, 'ok');
  assert.equal(scoped.body.me.name, 'Bruno');
});

test('el aviso de enlace usado explica cómo volver a entrar', async () => {
  const cookie = await setupDrawn();
  const bruno = (await participantsOf(cookie)).find((p) => p.name === 'Bruno');
  const token = await newInvite(cookie, bruno.id);
  await enterWith(token);
  const again = await enterWith(token);
  assert.equal(again.statusCode, 404);
  assert.match(again.body.error, /ya se usó/);
  assert.match(again.body.error, /mismo teléfono/);
  assert.match(again.body.error, /enlace nuevo/);
});

// --- Pistas (Etapa 4) ----------------------------------------------------------------------------------------------

const CLUES = ['Me gustan los mates largos', 'Siempre llego tarde', 'Cocino los domingos'];

async function playerSession(adminCookie, name) {
  const p = (await participantsOf(adminCookie)).find((x) => x.name === name);
  const res = await enterWith(await newInvite(adminCookie, p.id));
  assert.equal(res.statusCode, 200);
  return { cookie: sessionOf(res), id: p.id };
}

const recipientIdOf = (giverId) => cipher.decrypt(store._db.assignments.find((a) => a.giver_id === giverId).recipient_enc, giverId);

test('pistas: sin sesión 401 y antes del sorteo 409', async () => {
  assert.equal((await call(api.clues)).statusCode, 401);
  const admin = await setupEvent();
  assert.equal((await call(api.clues, { cookie: admin })).statusCode, 409);
});

test('pistas: borrador se guarda cifrado y se recupera', async () => {
  const admin = await setupDrawn();
  const bruno = await playerSession(admin, 'Bruno');
  const put = await call(api.clues, { method: 'PUT', cookie: bruno.cookie, body: { clues: [CLUES[0], '', ''] } });
  assert.equal(put.statusCode, 200);
  const got = await call(api.clues, { cookie: bruno.cookie });
  assert.deepEqual(got.body.clues, [CLUES[0], '', '']);
  assert.equal(got.body.confirmed, false);
  assert.ok(!JSON.stringify(store._db.drafts).includes('mates'));
});

test('pistas: confirmar exige las 3, las manda al pool anónimo y borra el borrador', async () => {
  const admin = await setupDrawn();
  const bruno = await playerSession(admin, 'Bruno');
  await call(api.clues, { method: 'PUT', cookie: bruno.cookie, body: { clues: CLUES } });

  const incomplete = await call(api.clues, { method: 'POST', cookie: bruno.cookie, body: { clues: [CLUES[0], '', CLUES[2]] } });
  assert.equal(incomplete.statusCode, 400);
  assert.equal(store._db.cluePool.length, 0);

  const ok = await call(api.clues, { method: 'POST', cookie: bruno.cookie, body: { clues: CLUES } });
  assert.equal(ok.statusCode, 200);

  const pool = store._db.cluePool;
  assert.equal(pool.length, 3);
  const recipient = recipientIdOf(bruno.id);
  for (const [i, row] of pool.entries()) {
    assert.deepEqual(Object.keys(row).sort(), ['event_id', 'id', 'recipient_id', 'round', 'text_enc']); // sin autor ni fechas
    assert.equal(row.recipient_id, recipient);
    assert.equal(row.round, i + 1);
    assert.equal(cipher.decrypt(row.text_enc, `pool:${recipient}:${row.round}`), CLUES[i]);
  }
  assert.ok(!JSON.stringify(pool).includes(bruno.id));
  assert.equal(store._db.drafts.length, 0);

  // Ya no se puede cambiar ni confirmar de nuevo, y GET no devuelve pistas.
  assert.equal((await call(api.clues, { method: 'POST', cookie: bruno.cookie, body: { clues: CLUES } })).statusCode, 409);
  assert.equal((await call(api.clues, { method: 'PUT', cookie: bruno.cookie, body: { clues: CLUES } })).statusCode, 409);
  const after = await call(api.clues, { cookie: bruno.cookie });
  assert.deepEqual(after.body.clues, ['', '', '']);
  assert.equal(after.body.confirmed, true);
  assert.equal(store._db.cluePool.length, 3);
});

test('pistas: validación de largo y de forma', async () => {
  const admin = await setupDrawn();
  const bruno = await playerSession(admin, 'Bruno');
  const long = 'a '.repeat(200);
  assert.equal((await call(api.clues, { method: 'PUT', cookie: bruno.cookie, body: { clues: [long, '', ''] } })).statusCode, 400);
  assert.equal((await call(api.clues, { method: 'PUT', cookie: bruno.cookie, body: { clues: ['x'] } })).statusCode, 400);
  assert.equal((await call(api.clues, { method: 'PUT', cookie: bruno.cookie, body: {} })).statusCode, 400);
});

test('pistas: la organizadora también escribe las suyas y el progreso es solo un total', async () => {
  const admin = await setupDrawn();
  const before = await call(api.event, { cookie: admin });
  assert.deepEqual(before.body.clues, { confirmed: 0, total: PEOPLE.length + 1 });

  assert.equal((await call(api.clues, { method: 'POST', cookie: admin, body: { clues: CLUES } })).statusCode, 200);
  const bruno = await playerSession(admin, 'Bruno');
  await call(api.clues, { method: 'POST', cookie: bruno.cookie, body: { clues: CLUES } });

  const after = await call(api.event, { cookie: admin });
  assert.deepEqual(after.body.clues, { confirmed: 2, total: PEOPLE.length + 1 });
  // Nada por persona: ni quién confirmó ni quién está escribiendo.
  for (const p of after.body.participants) assert.ok(!('confirmed' in p) && !('hasConfirmed' in p) && !('has_confirmed' in p));
  assert.ok(!('clues' in (await call(api.event)).body));
});

test('pistas: el pool no se puede leer por ninguna API y el borrador de uno no lo ve otro', async () => {
  const admin = await setupDrawn();
  const bruno = await playerSession(admin, 'Bruno');
  const carla = await playerSession(admin, PEOPLE[1]);
  await call(api.clues, { method: 'PUT', cookie: bruno.cookie, body: { clues: CLUES } });
  const seen = await call(api.clues, { cookie: carla.cookie });
  assert.deepEqual(seen.body.clues, ['', '', '']);
});
