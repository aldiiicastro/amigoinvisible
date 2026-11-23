import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Divider, Group, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { api } from '../api.js';
import ConfirmModal from './ConfirmModal.jsx';
import InviteModal from './InviteModal.jsx';
import ParticipantModal from './ParticipantModal.jsx';

const STATUS_LABEL = { preparing: 'En preparación', drawn: 'Sorteado', released: 'Pistas liberadas', closed: 'Cerrado' };
const INVITE_BADGE = {
  none: { label: 'Sin enlace', color: 'gray' },
  generated: { label: 'Enlace generado', color: 'yellow' },
  entered: { label: 'Ya entró', color: 'pine' },
};

export default function ParticipantsPanel({ data, reload, onNewCode }) {
  const { event, participants, limits } = data;
  // modal: { type: 'add' | 'edit' | 'remove' | 'invite' | 'draw' | 'newCode' | 'deleteEvent', participant? }
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [description, setDescription] = useState(event.description ?? '');
  const [descBusy, setDescBusy] = useState(false);
  const [descError, setDescError] = useState(null);
  const [descSaved, setDescSaved] = useState(false);

  const count = participants.length;
  const preparing = event.status === 'preparing';
  const drawn = event.status === 'drawn';
  const canEditNames = preparing || drawn;
  const canDraw = preparing && count >= limits.minToDraw;

  function open(next) {
    setError(null);
    setConfirmText('');
    setModal(next);
  }
  const close = () => setModal(null);

  async function saveDescription() {
    setDescBusy(true);
    setDescError(null);
    setDescSaved(false);
    try {
      const res = await api.setDescription(description);
      setDescription(res.description);
      await reload();
      setDescSaved(true);
    } catch (err) {
      setDescError(err.message);
    } finally {
      setDescBusy(false);
    }
  }

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

      {preparing && count < limits.minToDraw && (
        <Alert color="gray">Todavía faltan participantes: se necesitan al menos {limits.minToDraw} para poder sortear.</Alert>
      )}

      {drawn && data.clues && (
        <Alert color="gray" title="Pistas">
          {data.clues.confirmed} de {data.clues.total} confirmaron sus pistas.
        </Alert>
      )}

      {drawn && (
        <Alert color="pine">
          El sorteo está hecho. Generá y mandá el enlace de cada participante. Cada enlace sirve una sola vez: el que lo abre
          primero lo gasta, así que no abras los de los demás.
        </Alert>
      )}

      {canEditNames && (
        <Card withBorder padding="sm">
          <Stack gap="xs">
            <Textarea
              label="Indicaciones para los participantes"
              description='Se agregan al final del mensaje de WhatsApp y cada participante las ve en su pantalla. Ejemplo: "Tener las pistas listas para el 23 a la noche. El monto máximo a gastar es de $25.000."'
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescSaved(false);
              }}
              maxLength={600}
              autosize
              minRows={3}
              size="md"
            />
            {descError && <Alert color="cranberry">{descError}</Alert>}
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {descSaved ? 'Guardado ✓' : `${description.length}/600`}
              </Text>
              <Button size="xs" onClick={saveDescription} loading={descBusy} disabled={description === (event.description ?? '')}>
                Guardar indicaciones
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      <Stack gap="xs">
        {participants.map((p) => {
          const invite = p.invite ? INVITE_BADGE[p.invite] : null;
          return (
            <Card key={p.id} withBorder padding="sm">
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
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
                  {invite && (
                    <Badge color={invite.color} variant="light" style={{ flexShrink: 0 }}>
                      {invite.label}
                    </Badge>
                  )}
                </Group>
                <Group gap="xs">
                  {drawn && !p.isAdmin && (
                    <Button size="xs" color="pine" onClick={() => open({ type: 'invite', participant: p })}>
                      {p.invite === 'none' ? 'Generar enlace' : 'Enlace nuevo'}
                    </Button>
                  )}
                  {canEditNames && (
                    <Button size="xs" variant="light" onClick={() => open({ type: 'edit', participant: p })}>
                      Editar
                    </Button>
                  )}
                  {preparing && !p.isAdmin && (
                    <Button size="xs" variant="subtle" color="cranberry" onClick={() => open({ type: 'remove', participant: p })}>
                      Quitar
                    </Button>
                  )}
                </Group>
              </Stack>
            </Card>
          );
        })}
      </Stack>

      {preparing && (
        <Stack gap="xs">
          <Button size="md" variant="light" onClick={() => open({ type: 'add' })} disabled={count >= limits.maxParticipants}>
            Agregar participante
          </Button>
          {count >= limits.maxParticipants && (
            <Text size="sm" c="dimmed">
              Llegaste al máximo de {limits.maxParticipants} participantes.
            </Text>
          )}
          <Button size="md" disabled={!canDraw} onClick={() => open({ type: 'draw' })}>
            Hacer el sorteo
          </Button>
        </Stack>
      )}

      {drawn && (
        <Button component={Link} to="/mi-amigo" size="md" variant="light">
          Ver a quién me toca
        </Button>
      )}

      <Divider label="Opciones" labelPosition="left" />
      <Stack gap="xs" align="flex-start">
        <Button variant="subtle" onClick={() => open({ type: 'newCode' })}>
          Generar un nuevo código de recuperación
        </Button>
        {canEditNames && (
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

      {modal?.type === 'invite' && (
        <InviteModal
          key={modal.participant.id}
          opened
          participant={modal.participant}
          eventName={event.name}
          description={event.description}
          onClose={close}
          onChanged={reload}
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
        opened={modal?.type === 'draw'}
        title="Hacer el sorteo"
        confirmLabel="Sortear"
        color="pine"
        busy={busy}
        error={error}
        onClose={close}
        onConfirm={() =>
          run(
            () => api.draw(),
            () => reload(),
          )
        }
      >
        <Text>
          Vas a sortear entre {count} participantes. Una vez hecho <b>no se puede repetir</b> ni sumar o quitar gente.
        </Text>
        <Text size="sm" c="dimmed">
          El resultado es secreto: vos solo vas a ver a quién le toca regalarte a vos, igual que los demás.
        </Text>
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
        confirmDisabled={drawn && confirmText.trim().toUpperCase() !== 'BORRAR'}
        busy={busy}
        error={error}
        onClose={close}
        onConfirm={() =>
          run(
            () => api.deleteEvent(drawn),
            () => reload(),
          )
        }
      >
        <Text>
          Se borran el evento, los participantes{drawn ? ', el sorteo y todos los enlaces' : ''}. No se puede deshacer.
        </Text>
        {drawn && (
          <TextInput
            label="Para confirmar, escribí BORRAR"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        )}
      </ConfirmModal>
    </Stack>
  );
}
