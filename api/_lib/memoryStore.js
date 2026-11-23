import { randomUUID } from 'node:crypto';

// Implementación en memoria de la misma interfaz que store.js. Solo para tests.
export function createMemoryStore() {
  const events = [];
  const participants = [];

  const publicEvent = (e) => (e ? { id: e.id, name: e.name, status: e.status, release_at: e.release_at } : null);
  const publicParticipant = (p) => (p ? { id: p.id, name: p.name, phone: p.phone, is_admin: p.is_admin } : null);

  return {
    // Acceso directo para que los tests puedan inspeccionar lo que se guardó.
    _db: { events, participants },

    async countEvents() {
      return events.length;
    },
    async getEventByAdminHash(hash) {
      return publicEvent(events.find((e) => e.admin_token_hash === hash));
    },
    async getEventByRecoveryHash(hash) {
      return publicEvent(events.find((e) => e.recovery_hash === hash));
    },
    async createEvent({ name, adminTokenHash, recoveryHash, adminName, adminPhone }) {
      if (events.length > 0) throw Object.assign(new Error('Ya existe un evento.'), { code: 'DUPLICATE_EVENT' });
      const event = {
        id: randomUUID(),
        name,
        status: 'preparing',
        release_at: null,
        admin_token_hash: adminTokenHash,
        recovery_hash: recoveryHash,
      };
      events.push(event);
      participants.push({ id: randomUUID(), event_id: event.id, name: adminName, phone: adminPhone, is_admin: true });
      return publicEvent(event);
    },
    async setAdminTokenHash(eventId, hash) {
      events.find((e) => e.id === eventId).admin_token_hash = hash;
    },
    async setRecoveryHash(eventId, hash) {
      events.find((e) => e.id === eventId).recovery_hash = hash;
    },
    async deleteEvent(eventId) {
      const i = events.findIndex((e) => e.id === eventId);
      if (i >= 0) events.splice(i, 1);
      for (let j = participants.length - 1; j >= 0; j--) if (participants[j].event_id === eventId) participants.splice(j, 1);
    },
    async listParticipants(eventId) {
      return participants.filter((p) => p.event_id === eventId).map(publicParticipant);
    },
    async insertParticipant(eventId, { name, phone }) {
      const p = { id: randomUUID(), event_id: eventId, name, phone, is_admin: false };
      participants.push(p);
      return publicParticipant(p);
    },
    async updateParticipant(eventId, id, { name, phone }) {
      const p = participants.find((x) => x.id === id && x.event_id === eventId);
      if (!p) return null;
      Object.assign(p, { name, phone });
      return publicParticipant(p);
    },
    async deleteParticipant(eventId, id) {
      const i = participants.findIndex((x) => x.id === id && x.event_id === eventId && !x.is_admin);
      if (i < 0) return false;
      participants.splice(i, 1);
      return true;
    },
  };
}
