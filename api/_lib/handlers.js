import { HttpError } from './http.js';
import {
  PARTICIPANT_COOKIE,
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
import { MIN_PLAYERS, drawAssignments, isValidAssignment } from './draw.js';

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

/** Los nombres se pueden corregir antes y después del sorteo; sumar o quitar gente, solo antes. */
async function requireEditable(ctx) {
  const event = await requireAdmin(ctx);
  if (event.status !== 'preparing' && event.status !== 'drawn') {
    throw new HttpError(409, 'El evento ya no admite cambios en los participantes.');
  }
  return event;
}

const toPublicEvent = (e) => ({ name: e.name, status: e.status, releaseAt: e.release_at ?? null });

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
          participants: participants.map((p) => toPublicParticipant(p, event.status)),
          limits: { maxParticipants: MAX_PARTICIPANTS, minToDraw: MIN_PLAYERS },
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

  /**
   * Borra el evento y todo lo que cuelga de él. Antes del sorteo alcanza con pedirlo; después del sorteo
   * (que destruye el resultado) hace falta confirmar explícitamente con ?confirm=BORRAR.
   */
  async DELETE(ctx) {
    const event = await requireAdmin(ctx);
    if (event.status !== 'preparing' && event.status !== 'drawn') {
      throw new HttpError(409, 'El evento ya no se puede borrar.');
    }
    if (event.status === 'drawn' && ctx.req.query?.confirm !== 'BORRAR') {
      throw new HttpError(409, 'El sorteo ya se hizo. Borrarlo destruye el resultado: hace falta confirmarlo.');
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
      'Este enlace ya se usó o no es válido. Si no lo abriste vos, avisale a quien organiza el juego.',
    );
    if (token.length < 20 || token.length > 100) throw invalid;

    const sessionToken = newToken();
    const participantId = await ctx.store.redeemInvite(sha256(token), sha256(sessionToken));
    if (!participantId) throw invalid;
    return { cookies: [sessionCookie(sessionToken, ctx.req, PARTICIPANT_COOKIE)], body: { ok: true } };
  },
};

// --- /api/me -------------------------------------------------------------------------------------------------------

export const meMethods = {
  /** Lo único que ve cada persona: su propio nombre y a quién le toca regalar. */
  async GET(ctx) {
    let found = null;
    const sessionToken = tokenFromRequest(ctx.req, PARTICIPANT_COOKIE);
    if (sessionToken) found = await ctx.store.getParticipantBySession(sha256(sessionToken));

    if (!found) {
      // La organizadora juega como cualquier otra: entra con su sesión de administración.
      const event = await currentEvent(ctx);
      const admin = event ? await ctx.store.getAdminParticipant(event.id) : null;
      if (event && admin) found = { participant: admin, event };
    }
    if (!found) return { body: { state: 'no_session' } };

    const { participant, event } = found;
    const me = { name: participant.name, isAdmin: participant.is_admin };
    if (event.status === 'preparing') return { body: { state: 'not_drawn', event: { name: event.name }, me } };

    const encrypted = await ctx.store.getRecipientEnc(participant.id);
    if (!encrypted) return { body: { state: 'no_assignment', event: { name: event.name }, me } };
    const recipient = await ctx.store.getParticipantById(event.id, ctx.cipher.decrypt(encrypted, participant.id));
    if (!recipient) return { body: { state: 'no_assignment', event: { name: event.name }, me } };

    return { body: { state: 'ok', event: { name: event.name, status: event.status }, me, recipientName: recipient.name } };
  },
};
