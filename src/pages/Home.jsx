import { useEffect, useState } from 'react';
import { Alert, Loader, Stack, Text, Title } from '@mantine/core';

// Etapa 0: pantalla mínima que verifica que frontend, función y base de datos conversan.
export default function Home() {
  const [status, setStatus] = useState('loading'); // loading | ok | error

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body) => setStatus(body.ok ? 'ok' : 'error'))
      .catch(() => setStatus('error'));
  }, []);

  return (
    <Stack gap="md">
      <Title order={1}>🎄 Amigo Invisible</Title>
      <Text c="dimmed">Estamos preparando todo. Pronto vas a poder jugar desde acá.</Text>
      {status === 'loading' && <Loader size="sm" />}
      {status === 'ok' && <Alert color="pine">Servidor y base de datos funcionando.</Alert>}
      {status === 'error' && (
        <Alert color="cranberry">No se pudo conectar con el servidor. Revisá la configuración.</Alert>
      )}
    </Stack>
  );
}
