import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Anchor, Card, Loader, Stack, Text, Title } from '@mantine/core';
import { api } from '../api.js';

// Vista de participante (también la usa la organizadora, con su propia sesión).
export default function MyFriend() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .me()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <Alert color="cranberry">{error}</Alert>;
  if (!data) return <Loader size="sm" />;

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
        {data.me.isAdmin && <AdminBack />}
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
      <Text c="dimmed">
        Es un secreto: no se lo cuentes a nadie. Podés volver a esta pantalla cuando quieras desde este mismo teléfono.
      </Text>
      {data.me.isAdmin && <AdminBack />}
    </Stack>
  );
}

function AdminBack() {
  return (
    <Anchor component={Link} to="/admin">
      Volver al panel de organización
    </Anchor>
  );
}
