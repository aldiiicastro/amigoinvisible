import { useState } from 'react';
import { Alert, Button, Stack, Text, TextInput, Title } from '@mantine/core';
import { api } from '../api.js';

export default function RecoverAccessForm({ onRecovered }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.recover(code);
      onRecovered();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <Title order={2}>Ingresar como organizadora</Title>
        <Text c="dimmed">Escribí el código de recuperación que guardaste cuando creaste el evento.</Text>
        <TextInput
          label="Código de recuperación"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          required
          size="md"
        />
        {error && <Alert color="cranberry">{error}</Alert>}
        <Button type="submit" size="md" loading={busy}>
          Ingresar
        </Button>
      </Stack>
    </form>
  );
}
