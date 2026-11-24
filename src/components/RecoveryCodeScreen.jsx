import { useState } from 'react';
import { Alert, Button, Checkbox, Code, Stack, Text, Title } from '@mantine/core';

export default function RecoveryCodeScreen({ code, onDone }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false); // si el navegador no deja copiar, el código sigue visible para anotarlo
    }
  }

  return (
    <Stack gap="md">
      <Title order={2}>Guardá tu código de recuperación</Title>
      <Text>
        Es la llave de todos tus eventos. Si cambiás de celular o se borra la sesión, lo necesitás para volver a entrar como organizadora.
      </Text>
      <Code block fz={22} ta="center" py="md" style={{ letterSpacing: 1 }}>
        {code}
      </Code>
      <Button variant="light" onClick={copy}>
        {copied ? 'Copiado ✓' : 'Copiar código'}
      </Button>
      <Alert color="cranberry">
        Solo se muestra esta vez. Guardalo en un lugar seguro, por ejemplo en una nota o en tus mensajes guardados de WhatsApp.
      </Alert>
      <Checkbox
        checked={saved}
        onChange={(e) => setSaved(e.currentTarget.checked)}
        label="Ya guardé el código"
        size="md"
      />
      <Button size="md" disabled={!saved} onClick={onDone}>
        Continuar
      </Button>
    </Stack>
  );
}
