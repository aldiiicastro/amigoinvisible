import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Loader, Stack, Text, Title } from '@mantine/core';
import { api } from '../api.js';

// El enlace se canjea con un botón (POST) y no al cargar la página: así las vistas previas de WhatsApp no lo gastan.
export default function Enter() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  // Si esta persona ya entró desde este teléfono, no hace falta gastar el enlace: va directo a su pantalla.
  useEffect(() => {
    let cancelled = false;
    api
      .me('participant')
      .then((res) => {
        if (cancelled) return;
        if (res.state !== 'no_session') navigate('/mi-amigo', { replace: true });
        else setChecking(false);
      })
      .catch(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [navigate]);

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

  if (checking) return <Loader size="sm" />;

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
