import { Link } from 'react-router-dom';
import { Anchor, Stack, Text, Title } from '@mantine/core';

// Pantalla neutra: no revela nada del evento. Los participantes entran con su enlace privado.
export default function Home() {
  return (
    <Stack gap="md">
      <Title order={1}>🎄 Amigo Invisible</Title>
      <Text>Si te pasaron un enlace por WhatsApp, abrilo desde ese mensaje para entrar.</Text>
      <Anchor component={Link} to="/admin" size="sm" c="dimmed">
        Soy quien organiza el juego
      </Anchor>
    </Stack>
  );
}
