import { getSupabase } from './supabase.js';

// Único lugar que habla con Supabase para el evento y los participantes.
// Los handlers dependen de esta interfaz, así los tests usan memoryStore.js en su lugar.

const EVENT_COLS = 'id,name,status,release_at';
const PARTICIPANT_COLS = 'id,name,phone,is_admin';

const db = () => getSupabase();

function check({ data, error }) {
  if (error) throw error;
  return data;
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

  async deleteEvent(eventId) {
    check(await db().from('events').delete().eq('id', eventId));
  },

  async listParticipants(eventId) {
    return check(await db().from('participants').select(PARTICIPANT_COLS).eq('event_id', eventId));
  },

  async insertParticipant(eventId, { name, phone }) {
    return check(
      await db().from('participants').insert({ event_id: eventId, name, phone }).select(PARTICIPANT_COLS).single(),
    );
  },

  async updateParticipant(eventId, id, { name, phone }) {
    return check(
      await db()
        .from('participants')
        .update({ name, phone })
        .eq('id', id)
        .eq('event_id', eventId)
        .select(PARTICIPANT_COLS)
        .maybeSingle(),
    );
  },

  /** Devuelve true si borró a alguien. La administradora no se puede borrar. */
  async deleteParticipant(eventId, id) {
    const rows = check(
      await db().from('participants').delete().eq('id', id).eq('event_id', eventId).eq('is_admin', false).select('id'),
    );
    return rows.length > 0;
  },
};

export default store;
