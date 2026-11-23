import { useEffect, useState } from 'react';
import { Alert, Button, Card, Loader, Stack, Text, Textarea } from '@mantine/core';
import { api } from '../api.js';
import ConfirmModal from './ConfirmModal.jsx';

// Las 3 pistas que le llegan a quien te toca regalar. Se guardan como borrador hasta confirmar;
// al confirmar pasan a un pozo anónimo y ya no se pueden ver ni cambiar.
export default function CluesForm({ recipientName }) {
  const [state, setState] = useState(null); // { confirmed, maxLength }
  const [clues, setClues] = useState(['', '', '']);
  const [saved, setSaved] = useState(['', '', '']);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [askConfirm, setAskConfirm] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api
      .getClues()
      .then((res) => {
        setState(res);
        setClues(res.clues);
        setSaved(res.clues);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error && !state) return <Alert color="gray">{error}</Alert>;
  if (!state) return <Loader size="sm" />;

  if (state.confirmed) {
    return (
      <Alert color="pine" title="Pistas confirmadas">
        Listo, ya quedaron tus 3 pistas. Nadie sabe quién las escribió y vos tampoco podés verlas ni cambiarlas.
      </Alert>
    );
  }

  const dirty = clues.some((c, i) => c !== saved[i]);
  const complete = clues.every((c) => c.trim().length > 0);

  function change(i, value) {
    setClues((prev) => prev.map((c, j) => (j === i ? value : c)));
    setNotice(null);
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.saveClues(clues);
      setClues(res.clues);
      setSaved(res.clues);
      setNotice('Borrador guardado ✓');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.confirmClues(clues);
      setState({ ...state, confirmed: true });
      setAskConfirm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="md">
        <Text fw={600} size="lg">
          Tus 3 pistas
        </Text>
        <Text size="sm" c="dimmed">
          Escribí 3 pistas sobre vos para que {recipientName} te adivine. Van en tarjetas impresas sin nombre: nadie va a
          saber cuál es tuya. Podés guardar un borrador y seguir después; al confirmar ya no se cambian.
        </Text>
        {clues.map((value, i) => (
          <Textarea
            key={i}
            label={`Pista ${i + 1}`}
            value={value}
            onChange={(e) => change(i, e.target.value)}
            maxLength={state.maxLength}
            autosize
            minRows={2}
            size="md"
            description={`${value.length}/${state.maxLength}`}
          />
        ))}
        {error && <Alert color="cranberry">{error}</Alert>}
        {notice && <Text size="sm" c="pine">{notice}</Text>}
        <Button variant="light" onClick={saveDraft} loading={busy} disabled={!dirty}>
          Guardar borrador
        </Button>
        <Button color="pine" onClick={() => setAskConfirm(true)} disabled={!complete || busy}>
          Confirmar pistas
        </Button>
        {!complete && (
          <Text size="xs" c="dimmed">
            Para confirmar tenés que completar las 3.
          </Text>
        )}
      </Stack>

      <ConfirmModal
        opened={askConfirm}
        title="Confirmar pistas"
        confirmLabel="Confirmar"
        color="pine"
        busy={busy}
        error={error}
        onClose={() => setAskConfirm(false)}
        onConfirm={confirm}
      >
        <Text>Una vez confirmadas no podés verlas ni cambiarlas. ¿Las dejamos así?</Text>
      </ConfirmModal>
    </Card>
  );
}
