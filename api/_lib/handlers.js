import { HttpError } from './http.js';
import {
  PARTICIPANT_COOKIE,
  addSessionToken,
  tokensFromRequest,
  isValidRecoveryCodeShape,
  newRecoveryCode,
  newToken,
  normalizeRecoveryCode,
  sessionCookie,
  sha256,
  tokenFromRequest,
} from './auth.js';
import {
  MAX_PARTICIPANTS,
  nameKey,
  normalizeName,
  parsePhone,
  validateDescription,
  validateEventName,
} from './validate.js';
import { MAX_CLUE_LENGTH, checkClue, checkName, normalizeText } from './cardsPdf.js';
import { MIN_PLAYERS, drawAssignments, isValidAssignment } from './draw.js';
import { buildCardsPdf } from './cardsPdf.js';
import { createGenericDeck } from './genericClues.js';
import { shuffle } from './random.js';

// --- Helpers -------------------------------------------------------------------------------------------------------

const MAX_EVENTS = 20;

/** La organizadora de la sesión (cookie de administración) y todos sus eventos, o null. */
async function adminContext({ req, store }) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const organizer = await store.getOrganizerByAdminHash(sha256(token));
  if (!organizer) return null;
  return { organizer, events: await store.listEventsByOrganizer(organizer.id) };
}

/** Elige el evento: el de ?event=<id>, o el único que tenga. Devuelve null si hay que elegir. */
function pickEvent(events, req) {
  const id = req.query?.event;
  if (id) return events.find((e) => e.id === id) ?? null;
  return events.length === 1 ? events[0] : null;
}

async function requireAdmin(ctx) {
  const admin = await adminContext(ctx);
  if (!admin) throw new HttpError(401, 'Tu sesión de administradora no es válida. Ingresá con tu código de recuperación.');
  const event = pickEvent(admin.events, ctx.req);
  if (!event) {
    if (ctx.req.query?.event) throw new HttpError(404, 'No encontramos ese evento.');
    throw new HttpError(400, 'Elegí un evento.');
  }
  return event;
}

/** Los participantes solo se pueden tocar mientras el evento está en preparación (antes del sorteo). */
async function requirePreparing(ctx) {
  const event = await requireAdmin(ctx);
  if (event.status !== 'preparing') {
    throw new HttpError(409, 'El sorteo ya se hizo: no se pueden modificar los participantes.');
  }
  return event;
}

/** Los nombres se pueden corregir antes y después del sorteo; sumar o quitar gente, solo antes. */
async function requireEditable(ctx) {
  const event = await requireAdmin(ctx);
  if (event.status !== 'preparing' && event.status !== 'drawn') {
    throw new HttpError(409, 'El evento ya no admite cambios en los participantes.');
  }
  return event;
}

const toPublicEvent = (e) => ({
  id: e.id,
  name: e.name,
  status: e.status,
  releaseAt: e.release_at ?? null,
  description: e.description ?? '',
});

/**
 * `invite` solo existe después del sorteo: 'none' (sin enlace), 'generated' (enlace creado, sin abrir) o
 * 'entered' (ya lo abrió). No dice nada sobre pistas ni sobre a quién le toca regalar.
 */
function toPublicParticipant(p, eventStatus = 'preparing') {
  const out = { id: p.id, name: p.name, phone: p.phone, isAdmin: p.is_admin };
  if (eventStatus !== 'preparing' && !p.is_admin) {
    out.invite = p.has_session ? 'entered' : p.has_invite ? 'generated' : 'none';
  }
  return out;
}

function sortParticipants(list) {
  return [...list].sort((a, b) => Number(b.is_admin) - Number(a.is_admin) || a.name.localeCompare(b.name, 'es'));
}

/** Valida nombre y celular. Devuelve los valores limpios o lanza 400. */
async function parseParticipantInput(body) {
  const name = normalizeName(body.name);
  const nameProblem = await checkName(name);
  if (nameProblem) throw new HttpError(400, nameProblem);
  const phone = parsePhone(body.phone);
  if (phone.error) throw new HttpError(400, phone.error);
  return { name, phone: phone.value };
}

function assertNameFree(list, name, exceptId = null) {
  const key = nameKey(name);
  if (list.some((p) => p.id !== exceptId && nameKey(p.name) === key)) {
    throw new HttpError(409, 'Ya hay alguien con ese nombre. Agregá una inicial o el apellido para distinguirlos.');
  }
}

// --- /api/event ----------------------------------------------------------------------------------------------------

/**
 * Quién está del otro lado: sesión de participante o, si no hay, la organizadora (con su cookie de administración).
 * Con ?scope=participant solo cuenta la sesión de participante.
 * Si tiene varios eventos y no dice cuál (?event=<id>), devuelve `choices`.
 */
async function resolveParticipant(ctx) {
  const candidates = [];
  for (const token of tokensFromRequest(ctx.req, PARTICIPANT_COOKIE)) {
    const session = await ctx.store.getParticipantBySession(sha256(token));
    if (session && !candidates.some((c) => c.event.id === session.event.id)) candidates.push(session);
  }
  if (ctx.req.query?.scope !== 'participant') {
    const admin = await adminContext(ctx);
    for (const event of admin?.events ?? []) {
      if (candidates.some((c) => c.event.id === event.id)) continue;
      const adminPlayer = await ctx.store.getAdminParticipant(event.id);
      if (adminPlayer) candidates.push({ participant: adminPlayer, event });
    }
  }
  const wanted = ctx.req.query?.event;
  if (wanted) return { found: candidates.find((c) => c.event.id === wanted) ?? null };
  if (candidates.length <= 1) return { found: candidates[0] ?? null };
  return { choices: candidates.map((c) => ({ id: c.event.id, name: c.event.name })) };
}

export const eventMethods = {
  /** Estado para la pantalla de administración. Sin sesión válida no devuelve nada del evento. */
  async GET(ctx) {
    const admin = await adminContext(ctx);
    if (admin) {
      const events = admin.events.map((e) => ({ id: e.id, name: e.name, status: e.status }));
      if (ctx.req.query?.list) return { body: { state: 'ok', events } };
      const event = pickEvent(admin.events, ctx.req);
      if (!event) {
        if (ctx.req.query?.event) throw new HttpError(404, 'No encontramos ese evento.');
        return { body: { state: 'ok', events } };
      }
      const participants = sortParticipants(await ctx.store.listParticipants(event.id));
      return {
        body: {
          state: 'ok',
          events,
          event: toPublicEvent(event),
          participants: participants.map((p) => toPublicParticipant(p, event.status)),
          limits: { maxParticipants: MAX_PARTICIPANTS, minToDraw: MIN_PLAYERS },
          // Solo el total: nunca quién confirmó. Aparece después del sorteo.
          ...(event.status === 'preparing'
            ? {}
            : { clues: { confirmed: participants.filter((p) => p.has_confirmed).length, total: participants.length } }),
        },
      };
    }
    const exists = (await ctx.store.countOrganizers()) > 0;
    return { body: { state: exists ? 'needs_access' : 'no_event' } };
  },

  /** Crea el evento (solo uno) junto con la participante administradora. */
  async POST(ctx) {
    const eventName = validateEventName(ctx.body.eventName);
    if (eventName.error) throw new HttpError(400, eventName.error);

    const adminName = normalizeName(ctx.body.adminName);
    const adminNameProblem = await checkName(adminName);
    if (adminNameProblem) throw new HttpError(400, adminNameProblem);

    const phone = parsePhone(ctx.body.adminPhone);
    if (phone.error) throw new HttpError(400, phone.error);

    // Con sesión válida se suma un evento a la organizadora. Sin sesión solo se puede crear la primera vez.
    const admin = await adminContext(ctx);
    let organizerId;
    let token = null;
    let recoveryCode = null;
    if (admin) {
      if (admin.events.length >= MAX_EVENTS) throw new HttpError(409, `El máximo es de ${MAX_EVENTS} eventos.`);
      organizerId = admin.organizer.id;
    } else {
      const taken = new HttpError(409, 'Ya hay una organizadora registrada. Ingresá con tu código de recuperación.');
      if ((await ctx.store.countOrganizers()) > 0) throw taken;
      token = newToken();
      recoveryCode = newRecoveryCode();
      try {
        organizerId = (
          await ctx.store.createOrganizer({
            adminTokenHash: sha256(token),
            recoveryHash: sha256(normalizeRecoveryCode(recoveryCode)),
          })
        ).id;
      } catch (err) {
        if (err.code === 'DUPLICATE_ORGANIZER') throw taken;
        throw err;
      }
    }

    let event;
    try {
      event = await ctx.store.createEvent({ organizerId, name: eventName.value, adminName, adminPhone: phone.value });
    } catch (err) {
      if (!admin) await ctx.store.deleteOrganizer(organizerId); // no dejar una organizadora sin llave
      throw err;
    }
    return {
      status: 201,
      cookies: token ? [sessionCookie(token, ctx.req)] : [],
      body: { event: toPublicEvent(event), ...(recoveryCode ? { recoveryCode } : {}) },
    };
  },

  /** Actualiza las indicaciones del evento: se agregan al mensaje de WhatsApp y las ve cada participante. */
  async PATCH(ctx) {
    const event = await requireEditable(ctx);
    const description = validateDescription(ctx.body.description);
    if (description.error) throw new HttpError(400, description.error);
    await ctx.store.setEventDescription(event.id, description.value);
    return { body: { description: description.value } };
  },

  /**
   * Borra el evento y todo lo que cuelga de él. Antes del sorteo alcanza con pedirlo; después del sorteo
   * (que destruye el resultado) hace falta confirmar explícitamente con ?confirm=BORRAR.
   */
  async DELETE(ctx) {
    const event = await requireAdmin(ctx);
    if (event.status !== 'preparing' && event.status !== 'drawn' && event.status !== 'released') {
      throw new HttpError(409, 'El evento ya no se puede borrar.');
    }
    if (event.status !== 'preparing' && ctx.req.query?.confirm !== 'BORRAR') {
      throw new HttpError(409, 'El sorteo ya se hizo. Borrarlo destruye el resultado: hace falta confirmarlo.');
    }
    await ctx.store.deleteEvent(event.id);
    return { body: { ok: true } };
  },
};

// --- /api/participants ---------------------------------------------------------------------------------------------

export const participantMethods = {
  async POST(ctx) {
    const event = await requirePreparing(ctx);
    const input = await parseParticipantInput(ctx.body);
    const list = await ctx.store.listParticipants(event.id);
    if (list.length >= MAX_PARTICIPANTS) {
      throw new HttpError(409, `El máximo es de ${MAX_PARTICIPANTS} participantes.`);
    }
    assertNameFree(list, input.name);
    const participant = await ctx.store.insertParticipant(event.id, input);
    return { status: 201, body: { participant: toPublicParticipant(participant, event.status) } };
  },

  async PATCH(ctx) {
    const event = await requireEditable(ctx);
    const id = String(ctx.body.id ?? '');
    const input = await parseParticipantInput(ctx.body);
    const list = await ctx.store.listParticipants(event.id);
    if (!list.some((p) => p.id === id)) throw new HttpError(404, 'No encontramos a ese participante.');
    assertNameFree(list, input.name, id);
    const participant = await ctx.store.updateParticipant(event.id, id, input);
    if (!participant) throw new HttpError(404, 'No encontramos a ese participante.');
    return { body: { participant: toPublicParticipant(participant, event.status) } };
  },

  async DELETE(ctx) {
    const event = await requirePreparing(ctx);
    const id = String(ctx.req.query?.id ?? '');
    const list = await ctx.store.listParticipants(event.id);
    const target = list.find((p) => p.id === id);
    if (!target) throw new HttpError(404, 'No encontramos a ese participante.');
    if (target.is_admin) throw new HttpError(400, 'Vos sos parte del juego: no podés quitarte de la lista.');
    await ctx.store.deleteParticipant(event.id, id);
    return { body: { ok: true } };
  },
};

// --- /api/recover y /api/recovery-code -----------------------------------------------------------------------------

export const recoverMethods = {
  /** Vuelve a dar acceso con el código de recuperación. Invalida la sesión anterior. */
  async POST(ctx) {
    const code = normalizeRecoveryCode(ctx.body.code);
    const invalid = new HttpError(401, 'El código no es correcto. Revisalo e intentá de nuevo.');
    if (!isValidRecoveryCodeShape(code)) throw invalid;
    const organizer = await ctx.store.getOrganizerByRecoveryHash(sha256(code));
    if (!organizer) throw invalid;

    const token = newToken();
    await ctx.store.setOrganizerAdminHash(organizer.id, sha256(token));
    return { cookies: [sessionCookie(token, ctx.req)], body: { ok: true } };
  },
};

export const recoveryCodeMethods = {
  /** Genera un código nuevo. El anterior deja de servir. Se muestra una sola vez. */
  async POST(ctx) {
    const admin = await adminContext(ctx);
    if (!admin) throw new HttpError(401, 'Tu sesión de administradora no es válida. Ingresá con tu código de recuperación.');
    const recoveryCode = newRecoveryCode();
    await ctx.store.setOrganizerRecoveryHash(admin.organizer.id, sha256(normalizeRecoveryCode(recoveryCode)));
    return { body: { recoveryCode } };
  },
};

// --- /api/draw -----------------------------------------------------------------------------------------------------

export const drawMethods = {
  /**
   * Hace el sorteo, una sola vez. El resultado se guarda cifrado y NO se devuelve: ni la organizadora lo ve
   * (salvo a quién le toca a ella, igual que el resto, por /api/me).
   */
  async POST(ctx) {
    const event = await requirePreparing(ctx);
    const participants = await ctx.store.listParticipants(event.id);
    if (participants.length < MIN_PLAYERS) {
      throw new HttpError(409, `Se necesitan al menos ${MIN_PLAYERS} participantes para sortear.`);
    }

    const ids = participants.map((p) => p.id);
    const pairs = drawAssignments(ids);
    if (!isValidAssignment(ids, pairs)) throw new Error('El sorteo generado no cumple las reglas.'); // no debería pasar

    // El destinatario se cifra atado al id de quien regala: copiar el valor a otra fila no sirve.
    const rows = pairs.map(({ giver, recipient }) => ({
      giver_id: giver,
      recipient_enc: ctx.cipher.encrypt(recipient, giver),
    }));

    const done = await ctx.store.performDraw(event.id, rows);
    if (!done) throw new HttpError(409, 'El sorteo ya se hizo.');
    return { body: { ok: true } };
  },
};

// --- /api/invites --------------------------------------------------------------------------------------------------

export const inviteMethods = {
  /**
   * Genera un enlace nuevo para un participante. Solo se guarda su hash: el enlace se ve esta única vez.
   * Un enlace nuevo invalida el anterior y cierra la sesión que el participante pudiera tener.
   */
  async POST(ctx) {
    const event = await requireAdmin(ctx);
    if (event.status !== 'drawn') throw new HttpError(409, 'Los enlaces se generan después del sorteo.');
    const participantId = String(ctx.body.participantId ?? '');
    const target = await ctx.store.getParticipantById(event.id, participantId);
    if (!target) throw new HttpError(404, 'No encontramos a ese participante.');
    if (target.is_admin) throw new HttpError(400, 'Vos entrás con tu propia sesión: no necesitás enlace.');

    const token = newToken();
    const saved = await ctx.store.setInvite(event.id, participantId, sha256(token));
    if (!saved) throw new HttpError(404, 'No encontramos a ese participante.');
    return { body: { token } };
  },
};

// --- /api/enter ----------------------------------------------------------------------------------------------------

export const enterMethods = {
  /** Canjea el enlace privado (un solo uso) por una cookie de sesión. Se hace con un POST para que las vistas previas no lo gasten. */
  async POST(ctx) {
    const token = String(ctx.body.token ?? '');
    const invalid = new HttpError(
      404,
      'Este enlace ya se usó o no es válido. Si ya entraste antes, abrí la página desde el mismo teléfono. Si no, pedile a quien organiza un enlace nuevo.',
    );
    const wellFormed = token.length >= 20 && token.length <= 100;

    // Mirar sin gastar: la pantalla del enlace pregunta primero si todavía sirve.
    if (ctx.body.peek) return { body: { valid: wellFormed && (await ctx.store.hasInvite(sha256(token))) } };
    if (!wellFormed) throw invalid;

    const sessionToken = newToken();
    const participantId = await ctx.store.redeemInvite(sha256(token), sha256(sessionToken));
    if (!participantId) throw invalid;
    const session = await ctx.store.getParticipantBySession(sha256(sessionToken));
    // Una misma persona puede jugar varios eventos desde el mismo teléfono: se suma la sesión a las que ya tenía.
    const cookieValue = addSessionToken(ctx.req, sessionToken, PARTICIPANT_COOKIE);
    return {
      cookies: [sessionCookie(cookieValue, ctx.req, PARTICIPANT_COOKIE)],
      body: { ok: true, eventId: session?.event.id ?? null },
    };
  },
};

// --- /api/me -------------------------------------------------------------------------------------------------------

export const meMethods = {
  /** Lo único que ve cada persona: su propio nombre y a quién le toca regalar. */
  async GET(ctx) {
    const { found, choices } = await resolveParticipant(ctx);
    if (choices) return { body: { state: 'choose', events: choices } };
    if (!found) return { body: { state: 'no_session' } };

    const { participant, event } = found;
    const me = { name: participant.name, isAdmin: participant.is_admin };
    if (event.status === 'preparing') return { body: { state: 'not_drawn', event: { ...(participant.is_admin ? { id: event.id } : {}), name: event.name, description: event.description ?? '' }, me } };

    const encrypted = await ctx.store.getRecipientEnc(participant.id);
    if (!encrypted) return { body: { state: 'no_assignment', event: { ...(participant.is_admin ? { id: event.id } : {}), name: event.name, description: event.description ?? '' }, me } };
    const recipient = await ctx.store.getParticipantById(event.id, ctx.cipher.decrypt(encrypted, participant.id));
    if (!recipient) return { body: { state: 'no_assignment', event: { ...(participant.is_admin ? { id: event.id } : {}), name: event.name, description: event.description ?? '' }, me } };

    return {
      body: {
        state: 'ok',
        event: { ...(participant.is_admin ? { id: event.id } : {}), name: event.name, status: event.status, description: event.description ?? '' },
        me,
        recipientName: recipient.name,
      },
    };
  },
};

// --- /api/clues ----------------------------------------------------------------------------------------------------

const CLUE_COUNT = 3;

/** Devuelve la persona y su destinatario, o lanza el error que corresponda. */
async function requireGiver(ctx) {
  const { found, choices } = await resolveParticipant(ctx);
  if (choices) throw new HttpError(400, 'Elegí un evento.');
  if (!found) throw new HttpError(401, 'No encontramos tu sesión. Entrá desde tu enlace.');
  const { participant, event } = found;
  if (event.status !== 'drawn') throw new HttpError(409, 'Las pistas se escriben después del sorteo y hasta que se liberen.');
  const encrypted = await ctx.store.getRecipientEnc(participant.id);
  if (!encrypted) throw new HttpError(409, 'Todavía no tenés una asignación.');
  const recipientId = ctx.cipher.decrypt(encrypted, participant.id);
  return { participant, event, recipientId };
}

/** Normaliza lo que manda el cliente a exactamente 3 textos (vacíos permitidos en borradores). */
function readClues(body) {
  const list = body?.clues;
  if (!Array.isArray(list) || list.length !== CLUE_COUNT) throw new HttpError(400, `Se esperan ${CLUE_COUNT} pistas.`);
  return list.map((c) => normalizeText(typeof c === 'string' ? c : ''));
}

async function checkAll(clues, { requireAll }) {
  for (const [i, text] of clues.entries()) {
    if (!text) {
      if (requireAll) throw new HttpError(400, `Falta la pista ${i + 1}.`);
      continue;
    }
    const problem = await checkClue(text);
    if (problem) throw new HttpError(400, `Pista ${i + 1}: ${problem}`);
  }
}

const draftAad = (participantId, i) => `draft:${participantId}:${i}`;
const poolAad = (recipientId, round) => `pool:${recipientId}:${round}`;

export const cluesMethods = {
  /** Estado de las pistas de quien pregunta: si confirmó y su borrador. Nunca devuelve pistas de otras personas. */
  async GET(ctx) {
    const { participant } = await requireGiver(ctx);
    const base = { maxLength: MAX_CLUE_LENGTH, count: CLUE_COUNT };
    if (participant.has_confirmed) return { body: { ...base, confirmed: true, clues: ['', '', ''] } };
    const enc = await ctx.store.getDraftsEnc(participant.id);
    const clues = enc.map((e, i) => (e ? ctx.cipher.decrypt(e, draftAad(participant.id, i + 1)) : ''));
    return { body: { ...base, confirmed: false, clues } };
  },

  /** Guarda el borrador (puede estar incompleto). */
  async PUT(ctx) {
    const { participant } = await requireGiver(ctx);
    if (participant.has_confirmed) throw new HttpError(409, 'Ya confirmaste tus pistas.');
    const clues = readClues(ctx.body);
    await checkAll(clues, { requireAll: false });
    const enc = clues.map((c, i) => (c ? ctx.cipher.encrypt(c, draftAad(participant.id, i + 1)) : null));
    await ctx.store.saveDraftsEnc(participant.id, enc);
    return { body: { ok: true, clues } };
  },

  /** Confirma las 3 pistas: pasan al pool anónimo y ya no se pueden cambiar. */
  async POST(ctx) {
    const { participant, event, recipientId } = await requireGiver(ctx);
    if (participant.has_confirmed) throw new HttpError(409, 'Ya confirmaste tus pistas.');
    const clues = readClues(ctx.body);
    await checkAll(clues, { requireAll: true });
    const enc = clues.map((c, i) => ctx.cipher.encrypt(c, poolAad(recipientId, i + 1)));
    const done = await ctx.store.confirmClues(event.id, participant.id, recipientId, enc);
    if (!done) throw new HttpError(409, 'No se pudieron confirmar las pistas (ya confirmadas o evento cerrado).');
    return { body: { ok: true } };
  },
};

// --- /api/cards ----------------------------------------------------------------------------------------------------

/** Fija el orden de impresión del pool, una sola vez, mezclado con aleatoriedad criptográfica (sin autor ni fecha). */
async function ensurePositions(ctx, eventId) {
  const rows = await ctx.store.listPool(eventId);
  if (rows.every((r) => r.position != null)) return rows;
  const positions = [];
  for (let round = 1; round <= CLUE_COUNT; round++) {
    shuffle(rows.filter((r) => r.round === round).map((r) => r.id)).forEach((id, position) => positions.push({ id, position }));
  }
  await ctx.store.setPoolPositions(eventId, positions);
  return ctx.store.listPool(eventId);
}

export const cardsMethods = {
  /** Descarga el PDF de tarjetas (solo la organizadora y solo con el evento liberado). Siempre sale igual. */
  async GET(ctx) {
    const event = await requireAdmin(ctx);
    if (event.status !== 'released') throw new HttpError(409, 'Las pistas todavía no se liberaron.');
    const participants = await ctx.store.listParticipants(event.id);
    const rows = await ensurePositions(ctx, event.id);
    if (rows.length !== participants.length * CLUE_COUNT) throw new HttpError(500, 'Faltan pistas para armar las tarjetas.');

    const names = new Map(participants.map((p) => [p.id, p.name]));
    const rounds = [];
    for (let round = 1; round <= CLUE_COUNT; round++) {
      const cards = rows
        .filter((r) => r.round === round)
        .sort((a, b) => a.position - b.position)
        .map((r) => ({
          recipient: names.get(r.recipient_id),
          text: ctx.cipher.decrypt(r.text_enc, poolAad(r.recipient_id, round)),
        }));
      rounds.push({ round, cards });
    }
    const data = await buildCardsPdf(rounds);
    return { file: { data, contentType: 'application/pdf', filename: 'tarjetas.pdf' } };
  },

  /**
   * Libera las pistas: a quien no confirmó se le completan con su borrador y, si falta, con pistas genéricas.
   * Después no se puede escribir ni cambiar nada.
   */
  async POST(ctx) {
    const event = await requireAdmin(ctx);
    if (event.status !== 'drawn') throw new HttpError(409, 'Las pistas ya se liberaron o todavía no se hizo el sorteo.');
    const participants = await ctx.store.listParticipants(event.id);
    const nextGeneric = createGenericDeck();

    const fillers = [];
    for (const p of participants.filter((x) => !x.has_confirmed)) {
      const encrypted = await ctx.store.getRecipientEnc(p.id);
      if (!encrypted) throw new HttpError(409, 'Falta una asignación: no se pueden liberar las pistas.');
      const recipientId = ctx.cipher.decrypt(encrypted, p.id);
      const drafts = await ctx.store.getDraftsEnc(p.id);
      const texts = drafts.map((e, i) => (e ? ctx.cipher.decrypt(e, draftAad(p.id, i + 1)) : ''));
      const missing = texts.filter((t) => !t).length;
      const extra = nextGeneric(missing);
      texts.forEach((text, i) => {
        const clue = text || extra.pop();
        fillers.push({ recipient_id: recipientId, round: i + 1, text_enc: ctx.cipher.encrypt(clue, poolAad(recipientId, i + 1)) });
      });
    }

    const done = await ctx.store.releaseEvent(event.id, fillers);
    if (!done) throw new HttpError(409, 'No se pudo liberar: probá de nuevo.');
    await ensurePositions(ctx, event.id);
    return { body: { ok: true } };
  },
};
