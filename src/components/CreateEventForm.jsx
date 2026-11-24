import { useState } from 'react';
import { Alert, Button, Stack, Text, TextInput, Title } from '@mantine/core';
import { api } from '../api.js';

export default function CreateEventForm({ onCreated, title = 'Crear el evento' }) {
  const [eventName, setEventName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.createEvent({ eventName, adminName, adminPhone });
      onCreated(res);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <Title order={2}>{title}</Title>
        <Text c="dimmed">Vos también jugás: cargá tu nombre y tu WhatsApp como un participante más.</Text>
        <TextInput label="Nombre del evento" placeholder="Ej.: Navidad 2026 Familia" value={eventName} onChange={(e) => setEventName(e.target.value)} required size="md" />
        <TextInput
          label="Tu nombre"
          description="Es el que va a aparecer en las tarjetas."
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          required
          size="md"
        />
        <TextInput
          label="Tu WhatsApp"
          description="Con código de área, sin 0 ni 15. Ejemplo: 11 2345 6789"
          value={adminPhone}
          onChange={(e) => setAdminPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          required
          size="md"
        />
        {error && <Alert color="cranberry">{error}</Alert>}
        <Button type="submit" size="md" loading={busy}>
          Crear evento
        </Button>
      </Stack>
    </form>
  );
}
