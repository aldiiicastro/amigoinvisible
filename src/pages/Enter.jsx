import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Loader, Stack, Text, Title } from '@mantine/core';
import { api, setActiveEvent } from '../api.js';

const USED_MESSAGE =
  'Este enlace ya se usó o no es válido. Si ya entraste antes, abrí la página desde el mismo teléfono. Si no, pedile a quien organiza un enlace nuevo.';

// El enlace se canjea con un botón (POST) y no al cargar la página: así las vistas previas de WhatsApp no lo gastan.
export default function Enter() {
  const { token } = useParams();
  const navigate = useNavigate();
  setActiveEvent(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  // Primero se mira (sin gastarlo) si el enlace sirve. Si ya no sirve pero este teléfono ya tiene sesión, va directo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { valid } = await api.peekInvite(token);
        if (cancelled) return;
        if (valid) return setChecking(false);
        const me = await api.me('participant');
        if (cancelled) return;
        if (me.state !== 'no_session') return navigate('/mi-amigo', { replace: true });
        setError(USED_MESSAGE);
      } catch {
        if (!cancelled) setError(null);
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.enter(token);
      navigate(res.eventId ? `/mi-amigo/${res.eventId}` : '/mi-amigo', { replace: true }); // el enlace no queda en el historial
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
      {error !== USED_MESSAGE && (
        <Button size="lg" onClick={enter} loading={busy}>
          Entrar
        </Button>
      )}
    </Stack>
  );
}
