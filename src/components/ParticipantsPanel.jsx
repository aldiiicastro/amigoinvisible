import { useState } from 'react';
import { Alert, Badge, Button, Card, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { api } from '../api.js';
import ConfirmModal from './ConfirmModal.jsx';
import ParticipantModal from './ParticipantModal.jsx';

const STATUS_LABEL = { preparing: 'En preparación', drawn: 'Sorteado', released: 'Pistas liberadas', closed: 'Cerrado' };

export default function ParticipantsPanel({ data, reload, onNewCode }) {
  const { event, participants, limits } = data;
  const [modal, setModal] = useState(null); // { type: 'add' | 'edit' | 'remove' | 'newCode' | 'deleteEvent', participant? }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const count = participants.length;
  const editable = event.status === 'preparing';

  function open(next) {
    setError(null);
    setModal(next);
  }
  const close = () => setModal(null);

  async function run(action, onDone) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onDone();
      setModal(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2}>{event.name}</Title>
        <Group gap="xs">
          <Badge color="pine" variant="light">
            {STATUS_LABEL[event.status] ?? event.status}
          </Badge>
          <Text size="sm" c="dimmed">
            {count} {count === 1 ? 'participante' : 'participantes'}
          </Text>
        </Group>
      </Stack>

      {editable && count < limits.minToDraw && (
        <Alert color="gray">
          Todavía faltan participantes: se necesitan al menos {limits.minToDraw} para poder sortear.
        </Alert>
      )}

      <Stack gap="xs">
        {participants.map((p) => (
          <Card key={p.id} withBorder padding="sm">
            <Group justify="space-between" wrap="nowrap" align="center">
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Group gap="xs">
                  <Text fw={600}>{p.name}</Text>
                  {p.isAdmin && (
                    <Badge size="sm" variant="light">
                      Vos
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  +{p.phone}
                </Text>
              </Stack>
              {editable && (
                <Group gap="xs" wrap="nowrap">
                  <Button size="xs" variant="light" onClick={() => open({ type: 'edit', participant: p })}>
                    Editar
                  </Button>
                  {!p.isAdmin && (
                    <Button size="xs" variant="subtle" color="cranberry" onClick={() => open({ type: 'remove', participant: p })}>
                      Quitar
                    </Button>
                  )}
                </Group>
              )}
            </Group>
          </Card>
        ))}
      </Stack>

      {editable && (
        <Button size="md" onClick={() => open({ type: 'add' })} disabled={count >= limits.maxParticipants}>
          Agregar participante
        </Button>
      )}
      {count >= limits.maxParticipants && <Text size="sm" c="dimmed">Llegaste al máximo de {limits.maxParticipants} participantes.</Text>}

      <Text size="sm" c="dimmed">
        Cuando estén todos cargados, el próximo paso es hacer el sorteo y mandar las invitaciones.
      </Text>

      <Divider label="Opciones" labelPosition="left" />
      <Stack gap="xs" align="flex-start">
        <Button variant="subtle" onClick={() => open({ type: 'newCode' })}>
          Generar un nuevo código de recuperación
        </Button>
        {editable && (
          <Button variant="subtle" color="cranberry" onClick={() => open({ type: 'deleteEvent' })}>
            Borrar el evento
          </Button>
        )}
      </Stack>

      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <ParticipantModal
          key={modal.participant?.id ?? 'add'}
          opened
          participant={modal.participant ?? null}
          onClose={close}
          onSaved={async () => {
            await reload();
            close();
          }}
        />
      )}

      <ConfirmModal
        opened={modal?.type === 'remove'}
        title="Quitar participante"
        confirmLabel="Quitar"
        busy={busy}
        error={error}
        onClose={close}
        onConfirm={() =>
          run(
            () => api.removeParticipant(modal.participant.id),
            () => reload(),
          )
        }
      >
        <Text>¿Querés quitar a {modal?.participant?.name} de la lista?</Text>
      </ConfirmModal>

      <ConfirmModal
        opened={modal?.type === 'newCode'}
        title="Nuevo código de recuperación"
        confirmLabel="Generar código"
        color="pine"
        busy={busy}
        error={error}
        onClose={close}
        onConfirm={() =>
          run(
            async () => {
              const res = await api.newRecoveryCode();
              onNewCode(res.recoveryCode);
            },
            async () => {},
          )
        }
      >
        <Text>El código anterior va a dejar de funcionar. El nuevo se muestra una sola vez.</Text>
      </ConfirmModal>

      <ConfirmModal
        opened={modal?.type === 'deleteEvent'}
        title="Borrar el evento"
        confirmLabel="Borrar todo"
        busy={busy}
        error={error}
        onClose={close}
        onConfirm={() =>
          run(
            () => api.deleteEvent(),
            () => reload(),
          )
        }
      >
        <Text>Se borran el evento y todos los participantes cargados. No se puede deshacer.</Text>
      </ConfirmModal>
    </Stack>
  );
}
