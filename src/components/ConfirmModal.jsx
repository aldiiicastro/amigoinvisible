import { Alert, Button, Group, Modal, Stack } from '@mantine/core';

export default function ConfirmModal({ opened, title, children, confirmLabel, color = 'cranberry', busy, error, onConfirm, onClose }) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="md">
        {children}
        {error && <Alert color="cranberry">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button color={color} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
