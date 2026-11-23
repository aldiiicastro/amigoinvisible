import { Stack, Text, Title } from '@mantine/core';

export default function NotFound() {
  return (
    <Stack gap="md">
      <Title order={2}>Página no encontrada</Title>
      <Text c="dimmed">Revisá que el enlace esté completo.</Text>
    </Stack>
  );
}
