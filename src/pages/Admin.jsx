import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Loader, Stack, Title } from '@mantine/core';
import { api } from '../api.js';
import CreateEventForm from '../components/CreateEventForm.jsx';
import ParticipantsPanel from '../components/ParticipantsPanel.jsx';
import RecoverAccessForm from '../components/RecoverAccessForm.jsx';
import RecoveryCodeScreen from '../components/RecoveryCodeScreen.jsx';

// Puerta de administración: según lo que diga el servidor muestra crear evento, recuperar acceso o el panel.
export default function Admin() {
  const [view, setView] = useState({ state: 'loading' });
  const [shownCode, setShownCode] = useState(null); // código de recuperación recién generado (se ve una sola vez)

  const load = useCallback(async () => {
    try {
      setView(await api.getEvent());
    } catch (err) {
      setView({ state: 'error', message: err.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (shownCode) return <RecoveryCodeScreen code={shownCode} onDone={() => setShownCode(null)} />;

  switch (view.state) {
    case 'loading':
      return <Loader size="sm" />;
    case 'error':
      return (
        <Stack gap="md">
          <Title order={2}>Administración</Title>
          <Alert color="cranberry">{view.message}</Alert>
          <Button onClick={load}>Reintentar</Button>
        </Stack>
      );
    case 'no_event':
      return (
        <CreateEventForm
          onCreated={(code) => {
            setShownCode(code);
            load();
          }}
        />
      );
    case 'needs_access':
      return <RecoverAccessForm onRecovered={load} />;
    default:
      return <ParticipantsPanel data={view} reload={load} onNewCode={setShownCode} />;
  }
}
