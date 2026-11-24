import { getSupabase } from './supabase.js';

// Único lugar que habla con Supabase para el evento, los participantes y el sorteo.
// Los handlers dependen de esta interfaz, así los tests usan memoryStore.js en su lugar.

const EVENT_COLS = 'id,name,status,release_at,description';
const PARTICIPANT_COLS = 'id,name,phone,is_admin,invite_token_hash,session_hash,confirmed';

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
    has_confirmed: Boolean(row.confirmed),
  };
}

const store = {
  async countEvents() {
    const { count, error } = await db().from('events').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  },

  // --- Organizadora (una por instalación): dueña de todos los eventos ---
  async countOrganizers() {
    const { count, error } = await db().from('organizers').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  },

  async getOrganizerByAdminHash(hash) {
    return check(await db().from('organizers').select('id').eq('admin_token_hash', hash).maybeSingle());
  },

  async getOrganizerByRecoveryHash(hash) {
    return check(await db().from('organizers').select('id').eq('recovery_hash', hash).maybeSingle());
  },

  /** Lanza { code: 'DUPLICATE_ORGANIZER' } si ya hay una. */
  async createOrganizer({ adminTokenHash, recoveryHash }) {
    const { data, error } = await db()
      .from('organizers')
      .insert({ admin_token_hash: adminTokenHash, recovery_hash: recoveryHash })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') throw Object.assign(new Error('Ya existe una organizadora.'), { code: 'DUPLICATE_ORGANIZER' });
      throw error;
    }
    return data;
  },

  async deleteOrganizer(id) {
    check(await db().from('organizers').delete().eq('id', id));
  },

  async setOrganizerAdminHash(id, hash) {
    check(await db().from('organizers').update({ admin_token_hash: hash }).eq('id', id));
  },

  async setOrganizerRecoveryHash(id, hash) {
    check(await db().from('organizers').update({ recovery_hash: hash }).eq('id', id));
  },

  async listEventsByOrganizer(organizerId) {
    return check(await db().from('events').select(EVENT_COLS).eq('organizer_id', organizerId).order('created_at'));
  },

  /** Crea el evento y la participante administradora. */
  async createEvent({ organizerId, name, adminName, adminPhone }) {
    const event = check(
      await db().from('events').insert({ organizer_id: organizerId, name }).select(EVENT_COLS).single(),
    );
    const { error: participantError } = await db()
      .from('participants')
      .insert({ event_id: event.id, name: adminName, phone: adminPhone, is_admin: true });
    if (participantError) {
      await db().from('events').delete().eq('id', event.id);
      throw participantError;
    }
    return event;
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

  /** ¿Hay un enlace sin usar con este hash? No lo gasta. */
  async hasInvite(tokenHash) {
    const row = check(await db().from('participants').select('id').eq('invite_token_hash', tokenHash).maybeSingle());
    return Boolean(row);
  },

  /** Borrador cifrado de la persona: [pista1, pista2, pista3] (cada una cifrada o null). */
  async getDraftsEnc(participantId) {
    const row = check(await db().from('drafts').select('clue1_enc,clue2_enc,clue3_enc').eq('participant_id', participantId).maybeSingle());
    return row ? [row.clue1_enc, row.clue2_enc, row.clue3_enc] : [null, null, null];
  },

  async saveDraftsEnc(participantId, [c1, c2, c3]) {
    check(
      await db()
        .from('drafts')
        .upsert({ participant_id: participantId, clue1_enc: c1, clue2_enc: c2, clue3_enc: c3 }),
    );
  },

  /** Confirma las 3 pistas (ya cifradas) en una transacción. Devuelve false si ya había confirmado o el estado no lo permite. */
  async confirmClues(eventId, participantId, recipientId, cluesEnc) {
    return (
      check(
        await db().rpc('confirm_clues', {
          p_event_id: eventId,
          p_participant_id: participantId,
          p_recipient_id: recipientId,
          p_clues: cluesEnc,
        }),
      ) === true
    );
  },

  /** Libera el evento con las pistas de relleno (ya cifradas). Devuelve false si no estaba en 'drawn'. */
  async releaseEvent(eventId, fillers) {
    return check(await db().rpc('release_event', { p_event_id: eventId, p_fillers: fillers })) === true;
  },

  /** Todas las pistas del pool (cifradas), sin autor. */
  async listPool(eventId) {
    return check(await db().from('clue_pool').select('id,recipient_id,round,text_enc,position').eq('event_id', eventId));
  },

  async setPoolPositions(eventId, positions) {
    check(await db().rpc('set_pool_positions', { p_event_id: eventId, p_positions: positions }));
  },

  async getParticipantBySession(sessionHash) {
    const row = check(await db().from('participants').select(`${PARTICIPANT_COLS},event_id`).eq('session_hash', sessionHash).maybeSingle());
    if (!row) return null;
    const event = check(await db().from('events').select(EVENT_COLS).eq('id', row.event_id).maybeSingle());
    return event ? { participant: toParticipant(row), event } : null;
  },
};

export default store;
