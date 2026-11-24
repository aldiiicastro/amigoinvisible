import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Anchor, Card, Loader, Stack, Text, Title } from '@mantine/core';
import { api, setActiveEvent } from '../api.js';
import CluesForm from '../components/CluesForm.jsx';

// Vista de participante (también la usa la organizadora, con su propia sesión).
export default function MyFriend() {
  const { eventId } = useParams();
  setActiveEvent(eventId ?? null); // antes de cualquier pedido de esta pantalla
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    api
      .me()
      .then(setData)
      .catch((err) => setError(err.message));
  }, [eventId]);

  if (error) return <Alert color="cranberry">{error}</Alert>;
  if (!data) return <Loader size="sm" />;

  if (data.state === 'choose') {
    return (
      <Stack gap="md">
        <Title order={2}>¿Qué evento querés ver?</Title>
        {data.events.map((e) => (
          <Card key={e.id} withBorder padding="md" component={Link} to={`/mi-amigo/${e.id}`} style={{ textDecoration: 'none' }}>
            <Text fw={600}>{e.name}</Text>
          </Card>
        ))}
      </Stack>
    );
  }

  if (data.state === 'no_session') {
    return (
      <Stack gap="md">
        <Title order={2}>No encontramos tu sesión</Title>
        <Text>
          Entrá desde el enlace que te mandaron. Si ya lo usaste en otro teléfono o lo perdiste, pedile a quien organiza
          que te genere uno nuevo.
        </Text>
      </Stack>
    );
  }

  if (data.state !== 'ok') {
    return (
      <Stack gap="md">
        <Title order={2}>Hola, {data.me.name} 🎄</Title>
        <Text>
          {data.state === 'not_drawn'
            ? 'El sorteo todavía no se hizo. Volvé a entrar cuando esté listo.'
            : 'Todavía no tenés una asignación. Avisale a quien organiza.'}
        </Text>
        {data.me.isAdmin && <AdminBack eventId={data.event?.id} />}
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2}>Hola, {data.me.name} 🎄</Title>
        <Text c="dimmed">{data.event.name}</Text>
      </Stack>

      <Text size="lg">Te toca regalarle a:</Text>
      <Card withBorder padding="xl" ta="center">
        <Title order={1} fz={36}>
          {data.recipientName}
        </Title>
      </Card>
      {data.event.description && (
        <Card withBorder padding="md">
          <Text fw={600} mb={4}>
            Indicaciones
          </Text>
          <Text style={{ whiteSpace: 'pre-wrap' }}>{data.event.description}</Text>
        </Card>
      )}
      <Text c="dimmed">
        Es un secreto: no se lo cuentes a nadie. Podés volver a esta pantalla cuando quieras desde este mismo teléfono.
      </Text>
      {data.event.status === 'drawn' && <CluesForm recipientName={data.recipientName} />}
      {data.event.status === 'released' && (
        <Alert color="pine" title="Pistas listas">
          Las pistas ya están armadas. Ya no se pueden cambiar. ¡Nos vemos en la entrega!
        </Alert>
      )}
      {data.me.isAdmin && <AdminBack eventId={data.event?.id} />}
    </Stack>
  );
}

function AdminBack({ eventId }) {
  return (
    <Anchor component={Link} to={eventId ? `/admin/${eventId}` : '/admin'}>
      Volver al panel de organización
    </Anchor>
  );
}
