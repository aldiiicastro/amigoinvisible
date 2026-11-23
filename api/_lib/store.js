import { getSupabase } from './supabase.js';

// Único lugar que habla con Supabase para el evento, los participantes y el sorteo.
// Los handlers dependen de esta interfaz, así los tests usan memoryStore.js en su lugar.

const EVENT_COLS = 'id,name,status,release_at,description';
const PARTICIPANT_COLS = 'id,name,phone,is_admin,invite_token_hash,session_hash';

const db = () => getSupabase();

function check({ data, error }) {
  if (error) throw error;
  return data;
}

/** Devuelve el participante sin hashes: solo si tiene enlace generado y si ya entró. */
function toParticipant(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    is_admin: row.is_admin,
    has_invite: Boolean(row.invite_token_hash),
    has_session: Boolean(row.session_hash),
  };
}

const store = {
  async countEvents() {
    const { count, error } = await db().from('events').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  },

  async getEventByAdminHash(hash) {
    return check(await db().from('events').select(EVENT_COLS).eq('admin_token_hash', hash).maybeSingle());
  },

  async getEventByRecoveryHash(hash) {
    return check(await db().from('events').select(EVENT_COLS).eq('recovery_hash', hash).maybeSingle());
  },

  /** Crea el evento y la participante administradora. Lanza { code: 'DUPLICATE_EVENT' } si ya hay un evento. */
  async createEvent({ name, adminTokenHash, recoveryHash, adminName, adminPhone }) {
    const { data: event, error } = await db()
      .from('events')
      .insert({ name, admin_token_hash: adminTokenHash, recovery_hash: recoveryHash })
      .select(EVENT_COLS)
      .single();
    if (error) {
      if (error.code === '23505') throw Object.assign(new Error('Ya existe un evento.'), { code: 'DUPLICATE_EVENT' });
      throw error;
    }
    const { error: participantError } = await db()
      .from('participants')
      .insert({ event_id: event.id, name: adminName, phone: adminPhone, is_admin: true });
    if (participantError) {
      await db().from('events').delete().eq('id', event.id);
      throw participantError;
    }
    return event;
  },

  async setAdminTokenHash(eventId, hash) {
    check(await db().from('events').update({ admin_token_hash: hash }).eq('id', eventId));
  },

  async setRecoveryHash(eventId, hash) {
    check(await db().from('events').update({ recovery_hash: hash }).eq('id', eventId));
  },

  async setEventDescription(eventId, description) {
    check(await db().from('events').update({ description }).eq('id', eventId));
  },

  async deleteEvent(eventId) {
    check(await db().from('events').delete().eq('id', eventId));
  },

  async listParticipants(eventId) {
    const rows = check(await db().from('participants').select(PARTICIPANT_COLS).eq('event_id', eventId));
    return rows.map(toParticipant);
  },

  async getParticipantById(eventId, id) {
    return toParticipant(
      check(await db().from('participants').select(PARTICIPANT_COLS).eq('id', id).eq('event_id', eventId).maybeSingle()),
    );
  },

  async getAdminParticipant(eventId) {
    return toParticipant(
      check(await db().from('participants').select(PARTICIPANT_COLS).eq('event_id', eventId).eq('is_admin', true).maybeSingle()),
    );
  },

  async insertParticipant(eventId, { name, phone }) {
    return toParticipant(
      check(await db().from('participants').insert({ event_id: eventId, name, phone }).select(PARTICIPANT_COLS).single()),
    );
  },

  async updateParticipant(eventId, id, { name, phone }) {
    return toParticipant(
      check(
        await db()
          .from('participants')
          .update({ name, phone })
          .eq('id', id)
          .eq('event_id', eventId)
          .select(PARTICIPANT_COLS)
          .maybeSingle(),
      ),
    );
  },

  /** Devuelve true si borró a alguien. La administradora no se puede borrar. */
  async deleteParticipant(eventId, id) {
    const rows = check(
      await db().from('participants').delete().eq('id', id).eq('event_id', eventId).eq('is_admin', false).select('id'),
    );
    return rows.length > 0;
  },

  /**
   * Guarda el sorteo y pasa el evento de 'preparing' a 'drawn' en una sola transacción (función SQL perform_draw).
   * Devuelve false si el evento ya no estaba en preparación (nadie lo sortea dos veces).
   * @param {{giver_id: string, recipient_enc: string}[]} rows
   */
  async performDraw(eventId, rows) {
    return check(await db().rpc('perform_draw', { p_event_id: eventId, p_assignments: rows })) === true;
  },

  /** Devuelve el destinatario cifrado de quien regala, o null. */
  async getRecipientEnc(giverId) {
    const row = check(await db().from('assignments').select('recipient_enc').eq('giver_id', giverId).maybeSingle());
    return row?.recipient_enc ?? null;
  },

  /** Guarda un enlace nuevo para el participante y cierra su sesión anterior. Devuelve false si no existe o es la admin. */
  async setInvite(eventId, participantId, tokenHash) {
    const rows = check(
      await db()
        .from('participants')
        .update({ invite_token_hash: tokenHash, session_hash: null })
        .eq('id', participantId)
        .eq('event_id', eventId)
        .eq('is_admin', false)
        .select('id'),
    );
    return rows.length > 0;
  },

  /**
   * Canje de un solo uso: en un único UPDATE borra el enlace y guarda la sesión.
   * Si dos personas lo abren a la vez, solo una gana. Devuelve el id del participante o null.
   */
  async redeemInvite(tokenHash, sessionHash) {
    const rows = check(
      await db()
        .from('participants')
        .update({ invite_token_hash: null, session_hash: sessionHash })
        .eq('invite_token_hash', tokenHash)
        .select('id'),
    );
    return rows[0]?.id ?? null;
  },

  /** Participante (y su evento) a partir del hash de su cookie de sesión. */
  async getParticipantBySession(sessionHash) {
    const row = check(await db().from('participants').select(`${PARTICIPANT_COLS},event_id`).eq('session_hash', sessionHash).maybeSingle());
    if (!row) return null;
    const event = check(await db().from('events').select(EVENT_COLS).eq('id', row.event_id).maybeSingle());
    return event ? { participant: toParticipant(row), event } : null;
  },
};

export default store;
