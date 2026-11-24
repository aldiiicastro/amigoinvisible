import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Anchor, Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { api, setActiveEvent } from '../api.js';
import CreateEventForm from '../components/CreateEventForm.jsx';
import ParticipantsPanel from '../components/ParticipantsPanel.jsx';
import RecoverAccessForm from '../components/RecoverAccessForm.jsx';
import RecoveryCodeScreen from '../components/RecoveryCodeScreen.jsx';

const STATUS_LABEL = { preparing: 'En preparación', drawn: 'Sorteado', released: 'Pistas liberadas', closed: 'Cerrado' };

// Puerta de administración. /admin = mis eventos; /admin/<id> = el panel de un evento.
export default function Admin() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  setActiveEvent(eventId ?? null); // antes de cualquier pedido de esta pantalla

  const [view, setView] = useState({ state: 'loading' });
  const [shownCode, setShownCode] = useState(null); // código de recuperación recién generado (se ve una sola vez)
  const [creating, setCreating] = useState(false);
  const [afterCode, setAfterCode] = useState(null); // a dónde ir cuando termina de guardar el código

  const load = useCallback(async () => {
    try {
      setView(await (eventId ? api.getEvent() : api.listEvents()));
    } catch (err) {
      setView({ state: 'error', message: err.message });
    }
  }, [eventId]);

  useEffect(() => {
    setView({ state: 'loading' });
    setCreating(false);
    load();
  }, [load]);

  function created(res) {
    const go = () => navigate(`/admin/${res.event.id}`);
    if (res.recoveryCode) {
      setAfterCode(() => go);
      setShownCode(res.recoveryCode);
    } else go();
  }

  if (shownCode) {
    return (
      <RecoveryCodeScreen
        code={shownCode}
        onDone={() => {
          setShownCode(null);
          afterCode?.();
        }}
      />
    );
  }

  switch (view.state) {
    case 'loading':
      return <Loader size="sm" />;
    case 'error':
      return (
        <Stack gap="md">
          <Title order={2}>Administración</Title>
          <Alert color="cranberry">{view.message}</Alert>
          <Button onClick={load}>Reintentar</Button>
          {eventId && (
            <Anchor component={Link} to="/admin">
              Volver a mis eventos
            </Anchor>
          )}
        </Stack>
      );
    case 'no_event':
      return <CreateEventForm title="Crear el evento" onCreated={created} />;
    case 'needs_access':
      return <RecoverAccessForm onRecovered={load} />;
    default:
  }

  if (eventId) {
    // Al venir de la lista, `view` todavía tiene los datos de la lista: esperar a los del evento.
    if (view.event?.id !== eventId) return <Loader size="sm" />;
    return (
      <Stack gap="md">
        <Anchor component={Link} to="/admin" size="sm">
          ← Mis eventos
        </Anchor>
        <ParticipantsPanel
          data={view}
          reload={load}
          onNewCode={setShownCode}
          onDeleted={() => navigate('/admin', { replace: true })}
        />
      </Stack>
    );
  }

  if (creating || view.events.length === 0) {
    return (
      <Stack gap="md">
        {view.events.length > 0 && (
          <Anchor component="button" type="button" size="sm" onClick={() => setCreating(false)} ta="left">
            ← Mis eventos
          </Anchor>
        )}
        <CreateEventForm title={view.events.length > 0 ? 'Crear otro evento' : 'Crear el evento'} onCreated={created} />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Title order={2}>Mis eventos</Title>
      <Stack gap="xs">
        {view.events.map((e) => (
          <Card key={e.id} withBorder padding="md" component={Link} to={`/admin/${e.id}`} style={{ textDecoration: 'none' }}>
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600}>{e.name}</Text>
              <Badge color="pine" variant="light" style={{ flexShrink: 0 }}>
                {STATUS_LABEL[e.status] ?? e.status}
              </Badge>
            </Group>
          </Card>
        ))}
      </Stack>
      <Button size="md" variant="light" onClick={() => setCreating(true)}>
        Crear otro evento
      </Button>
    </Stack>
  );
}
