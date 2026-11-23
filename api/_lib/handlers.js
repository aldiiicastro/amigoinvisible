import { HttpError } from './http.js';
import {
  clearSessionCookie,
  isValidRecoveryCodeShape,
  newRecoveryCode,
  newToken,
  normalizeRecoveryCode,
  sessionCookie,
  sha256,
  tokenFromRequest,
} from './auth.js';
import { MAX_PARTICIPANTS, nameKey, normalizeName, parsePhone, validateEventName } from './validate.js';
import { checkName } from './cardsPdf.js';

// --- Helpers -------------------------------------------------------------------------------------------------------

async function currentEvent({ req, store }) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  return store.getEventByAdminHash(sha256(token));
}

async function requireAdmin(ctx) {
  const event = await currentEvent(ctx);
  if (!event) throw new HttpError(401, 'Tu sesión de administradora no es válida. Ingresá con tu código de recuperación.');
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

const toPublicEvent = (e) => ({ name: e.name, status: e.status, releaseAt: e.release_at ?? null });
const toPublicParticipant = (p) => ({ id: p.id, name: p.name, phone: p.phone, isAdmin: p.is_admin });

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

export const eventMethods = {
  /** Estado para la pantalla de administración. Sin sesión válida no devuelve nada del evento. */
  async GET(ctx) {
    const event = await currentEvent(ctx);
    if (event) {
      const participants = sortParticipants(await ctx.store.listParticipants(event.id));
      return {
        body: {
          state: 'ok',
          event: toPublicEvent(event),
          participants: participants.map(toPublicParticipant),
          limits: { maxParticipants: MAX_PARTICIPANTS, minToDraw: 3 },
        },
      };
    }
    const exists = (await ctx.store.countEvents()) > 0;
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

    if ((await ctx.store.countEvents()) > 0) {
      throw new HttpError(409, 'Ya existe un evento. Ingresá con tu código de recuperación.');
    }

    const token = newToken();
    const recoveryCode = newRecoveryCode();
    let event;
    try {
      event = await ctx.store.createEvent({
        name: eventName.value,
        adminTokenHash: sha256(token),
        recoveryHash: sha256(normalizeRecoveryCode(recoveryCode)),
        adminName,
        adminPhone: phone.value,
      });
    } catch (err) {
      if (err.code === 'DUPLICATE_EVENT') {
        throw new HttpError(409, 'Ya existe un evento. Ingresá con tu código de recuperación.');
      }
      throw err;
    }
    return {
      status: 201,
      cookies: [sessionCookie(token, ctx.req)],
      body: { recoveryCode, event: toPublicEvent(event) },
    };
  },

  /** Borra el evento y todo lo que cuelga de él. Solo antes del sorteo. */
  async DELETE(ctx) {
    const event = await requireAdmin(ctx);
    if (event.status !== 'preparing') {
      throw new HttpError(409, 'El sorteo ya se hizo: el evento no se puede borrar.');
    }
    await ctx.store.deleteEvent(event.id);
    return { cookies: [clearSessionCookie(ctx.req)], body: { ok: true } };
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
    return { status: 201, body: { participant: toPublicParticipant(participant) } };
  },

  async PATCH(ctx) {
    const event = await requirePreparing(ctx);
    const id = String(ctx.body.id ?? '');
    const input = await parseParticipantInput(ctx.body);
    const list = await ctx.store.listParticipants(event.id);
    if (!list.some((p) => p.id === id)) throw new HttpError(404, 'No encontramos a ese participante.');
    assertNameFree(list, input.name, id);
    const participant = await ctx.store.updateParticipant(event.id, id, input);
    if (!participant) throw new HttpError(404, 'No encontramos a ese participante.');
    return { body: { participant: toPublicParticipant(participant) } };
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
    const event = await ctx.store.getEventByRecoveryHash(sha256(code));
    if (!event) throw invalid;

    const token = newToken();
    await ctx.store.setAdminTokenHash(event.id, sha256(token));
    return { cookies: [sessionCookie(token, ctx.req)], body: { ok: true } };
  },
};

export const recoveryCodeMethods = {
  /** Genera un código nuevo. El anterior deja de servir. Se muestra una sola vez. */
  async POST(ctx) {
    const event = await requireAdmin(ctx);
    const recoveryCode = newRecoveryCode();
    await ctx.store.setRecoveryHash(event.id, sha256(normalizeRecoveryCode(recoveryCode)));
    return { body: { recoveryCode } };
  },
};
