import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { api } from '../api.js';

// Alta y edición. El panel lo monta con `key` distinto para cada participante, así el formulario arranca limpio.
export default function ParticipantModal({ opened, participant, onClose, onSaved }) {
  const editing = Boolean(participant);
  const [name, setName] = useState(participant?.name ?? '');
  const [phone, setPhone] = useState(participant ? `+${participant.phone}` : '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) await api.updateParticipant({ id: participant.id, name, phone });
      else await api.addParticipant({ name, phone });
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Editar participante' : 'Agregar participante'} centered>
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label="Nombre"
            description="Es el que va a aparecer en las tarjetas."
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            data-autofocus
            size="md"
          />
          <TextInput
            label="WhatsApp"
            description="Con código de área, sin 0 ni 15. Ejemplo: 11 2345 6789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            required
            size="md"
          />
          {error && <Alert color="cranberry">{error}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              {editing ? 'Guardar' : 'Agregar'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
