import { useState } from 'react';
import { Alert, Button, Code, Group, Modal, Stack, Text } from '@mantine/core';
import { api } from '../api.js';

const WARNING = {
  generated: 'Ya generaste un enlace para esta persona. Uno nuevo reemplaza al anterior, que deja de funcionar.',
  entered:
    'Esta persona ya entró con su enlace. Si generás uno nuevo, el anterior deja de funcionar y va a tener que abrir el nuevo para volver a entrar.',
};

// Genera el enlace privado de un participante. El enlace se ve solo ahora: en el servidor queda únicamente su hash.
export default function InviteModal({ opened, participant, eventName, onClose, onChanged }) {
  const [token, setToken] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createInvite(participant.id);
      setToken(res.token);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const link = token ? `${window.location.origin}/entrar/${token}` : null;
  const message = link
    ? `¡Hola ${participant.name}! 🎄 Te paso tu enlace privado para el Amigo Invisible "${eventName}":\n\n${link}\n\nEs solo para vos: abrilo desde tu celular y no lo reenvíes. Ahí vas a ver a quién le regalás y a preparar tus pistas.`
    : null;
  const whatsappUrl = message ? `https://wa.me/${participant.phone}?text=${encodeURIComponent(message)}` : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false); // si no se puede copiar, el enlace sigue visible
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`Enlace para ${participant.name}`} centered>
      <Stack gap="md">
        {!token && (
          <>
            <Text>
              Se genera un enlace privado de un solo uso para <b>{participant.name}</b>. Se muestra una única vez en esta
              pantalla.
            </Text>
            {WARNING[participant.invite] && <Alert color="yellow">{WARNING[participant.invite]}</Alert>}
            {error && <Alert color="cranberry">{error}</Alert>}
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={generate} loading={busy}>
                Generar enlace
              </Button>
            </Group>
          </>
        )}

        {token && (
          <>
            <Alert color="cranberry">
              Este enlace es solo para {participant.name}. <b>No lo abras vos</b>: si lo hacés, deja de servirle.
            </Alert>
            <Code block style={{ wordBreak: 'break-all' }}>
              {link}
            </Code>
            <Button component="a" href={whatsappUrl} target="_blank" rel="noopener noreferrer" size="md" color="pine">
              Enviar por WhatsApp
            </Button>
            <Button variant="light" onClick={copy}>
              {copied ? 'Copiado ✓' : 'Copiar enlace'}
            </Button>
            <Text size="sm" c="dimmed">
              Si lo perdés o no le llega, generá uno nuevo desde la lista.
            </Text>
            <Button variant="default" onClick={onClose}>
              Listo
            </Button>
          </>
        )}
      </Stack>
    </Modal>
  );
}
