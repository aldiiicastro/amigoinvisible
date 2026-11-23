import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Stack, Text, Title } from '@mantine/core';
import { api } from '../api.js';

// El enlace se canjea con un botón (POST) y no al cargar la página: así las vistas previas de WhatsApp no lo gastan.
export default function Enter() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      await api.enter(token);
      navigate('/mi-amigo', { replace: true }); // reemplaza la dirección: el enlace no queda en el historial
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Stack gap="md">
      <Title order={1}>🎄 Amigo Invisible</Title>
      <Text size="lg">Este enlace es solo para vos.</Text>
      <Text c="dimmed">
        Se puede abrir una única vez, así que entrá desde tu celular y no lo reenvíes. La próxima vez volvés a entrar
        desde el mismo teléfono sin necesidad del enlace.
      </Text>
      {error && <Alert color="cranberry">{error}</Alert>}
      <Button size="lg" onClick={enter} loading={busy}>
        Entrar
      </Button>
    </Stack>
  );
}
