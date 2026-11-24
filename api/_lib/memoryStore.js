import { randomUUID } from 'node:crypto';

// Implementación en memoria de la misma interfaz que store.js. Solo para tests.
export function createMemoryStore() {
  const organizers = [];
  const events = [];
  const participants = [];
  const assignments = [];
  const drafts = [];
  const cluePool = [];

  const publicEvent = (e) =>
    e ? { id: e.id, name: e.name, status: e.status, release_at: e.release_at, description: e.description } : null;
  const publicParticipant = (p) =>
    p
      ? {
          id: p.id,
          name: p.name,
          phone: p.phone,
          is_admin: p.is_admin,
          has_invite: Boolean(p.invite_token_hash),
          has_session: Boolean(p.session_hash),
          has_confirmed: Boolean(p.confirmed),
        }
      : null;

  return {
    // Acceso directo para que los tests puedan inspeccionar lo que se guardó.
    _db: { organizers, events, participants, assignments, drafts, cluePool },

    async countOrganizers() {
      return organizers.length;
    },
    async getOrganizerByAdminHash(hash) {
      const o = organizers.find((x) => x.admin_token_hash === hash);
      return o ? { id: o.id } : null;
    },
    async getOrganizerByRecoveryHash(hash) {
      const o = organizers.find((x) => x.recovery_hash === hash);
      return o ? { id: o.id } : null;
    },
    async createOrganizer({ adminTokenHash, recoveryHash }) {
      if (organizers.length > 0) throw Object.assign(new Error('Ya existe una organizadora.'), { code: 'DUPLICATE_ORGANIZER' });
      const o = { id: randomUUID(), admin_token_hash: adminTokenHash, recovery_hash: recoveryHash };
      organizers.push(o);
      return { id: o.id };
    },
    async deleteOrganizer(id) {
      const i = organizers.findIndex((o) => o.id === id);
      if (i >= 0) organizers.splice(i, 1);
    },
    async setOrganizerAdminHash(id, hash) {
      organizers.find((o) => o.id === id).admin_token_hash = hash;
    },
    async setOrganizerRecoveryHash(id, hash) {
      organizers.find((o) => o.id === id).recovery_hash = hash;
    },
    async listEventsByOrganizer(organizerId) {
      return events.filter((e) => e.organizer_id === organizerId).map(publicEvent);
    },
    async createEvent({ organizerId, name, adminName, adminPhone }) {
      const event = { id: randomUUID(), organizer_id: organizerId, name, status: 'preparing', release_at: null, description: '' };
      events.push(event);
      participants.push({ id: randomUUID(), event_id: event.id, name: adminName, phone: adminPhone, is_admin: true });
      return publicEvent(event);
    },
    async hasInvite(tokenHash) {
      return participants.some((p) => p.invite_token_hash === tokenHash);
    },
    async setEventDescription(eventId, description) {
      events.find((e) => e.id === eventId).description = description;
    },
    async deleteEvent(eventId) {
      const i = events.findIndex((e) => e.id === eventId);
      if (i >= 0) events.splice(i, 1);
      for (let j = participants.length - 1; j >= 0; j--) if (participants[j].event_id === eventId) participants.splice(j, 1);
      for (let j = assignments.length - 1; j >= 0; j--) if (assignments[j].event_id === eventId) assignments.splice(j, 1);
      for (let j = cluePool.length - 1; j >= 0; j--) if (cluePool[j].event_id === eventId) cluePool.splice(j, 1);
    },
    async listParticipants(eventId) {
      return participants.filter((p) => p.event_id === eventId).map(publicParticipant);
    },
    async getParticipantById(eventId, id) {
      return publicParticipant(participants.find((p) => p.id === id && p.event_id === eventId));
    },
    async getAdminParticipant(eventId) {
      return publicParticipant(participants.find((p) => p.event_id === eventId && p.is_admin));
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

    async performDraw(eventId, rows) {
      const event = events.find((e) => e.id === eventId);
      if (!event || event.status !== 'preparing') return false;
      for (const r of rows) assignments.push({ giver_id: r.giver_id, event_id: eventId, recipient_enc: r.recipient_enc });
      event.status = 'drawn';
      return true;
    },
    async getRecipientEnc(giverId) {
      return assignments.find((a) => a.giver_id === giverId)?.recipient_enc ?? null;
    },
    async setInvite(eventId, participantId, tokenHash) {
      const p = participants.find((x) => x.id === participantId && x.event_id === eventId && !x.is_admin);
      if (!p) return false;
      p.invite_token_hash = tokenHash;
      p.session_hash = null;
      return true;
    },
    async redeemInvite(tokenHash, sessionHash) {
      const p = participants.find((x) => x.invite_token_hash === tokenHash);
      if (!p) return null;
      p.invite_token_hash = null;
      p.session_hash = sessionHash;
      return p.id;
    },
    async getDraftsEnc(participantId) {
      return drafts.find((d) => d.participant_id === participantId)?.clues ?? [null, null, null];
    },
    async saveDraftsEnc(participantId, clues) {
      const row = drafts.find((d) => d.participant_id === participantId);
      if (row) row.clues = clues;
      else drafts.push({ participant_id: participantId, clues });
    },
    async confirmClues(eventId, participantId, recipientId, cluesEnc) {
      const event = events.find((e) => e.id === eventId);
      const p = participants.find((x) => x.id === participantId && x.event_id === eventId);
      if (!event || event.status !== 'drawn' || !p || p.confirmed) return false;
      cluesEnc.forEach((text_enc, i) =>
        cluePool.push({ id: randomUUID(), event_id: eventId, recipient_id: recipientId, round: i + 1, text_enc }),
      );
      p.confirmed = true;
      const d = drafts.findIndex((x) => x.participant_id === participantId);
      if (d >= 0) drafts.splice(d, 1);
      return true;
    },

    async releaseEvent(eventId, fillers) {
      const event = events.find((e) => e.id === eventId);
      if (!event || event.status !== 'drawn') return false;
      for (const f of fillers) {
        if (cluePool.some((r) => r.recipient_id === f.recipient_id && r.round === f.round)) continue;
        cluePool.push({ id: randomUUID(), event_id: eventId, recipient_id: f.recipient_id, round: f.round, text_enc: f.text_enc });
      }
      for (const p of participants) if (p.event_id === eventId) p.confirmed = true;
      for (let j = drafts.length - 1; j >= 0; j--) {
        if (participants.some((p) => p.id === drafts[j].participant_id && p.event_id === eventId)) drafts.splice(j, 1);
      }
      event.status = 'released';
      return true;
    },
    async listPool(eventId) {
      return cluePool.filter((r) => r.event_id === eventId).map((r) => ({ ...r, position: r.position ?? null }));
    },
    async setPoolPositions(eventId, positions) {
      for (const { id, position } of positions) {
        const row = cluePool.find((r) => r.id === id && r.event_id === eventId);
        if (row) row.position = position;
      }
    },

    async getParticipantBySession(sessionHash) {
      const p = participants.find((x) => x.session_hash === sessionHash);
      if (!p) return null;
      return { participant: publicParticipant(p), event: publicEvent(events.find((e) => e.id === p.event_id)) };
    },
  };
}
