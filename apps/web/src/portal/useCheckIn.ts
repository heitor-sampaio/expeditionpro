import { useState } from 'react';
import { api } from '../auth/api.js';

/**
 * GR-14 — o cliente confirma a presença da família na saída. A régua (dia da saída,
 * inscrição confirmada) é do servidor; aqui só sobra o resultado e a mensagem.
 */

export type CheckInResult = { ok: true } | { ok: false; message: string };

export function useCheckIn(onDone: () => void) {
  const [busy, setBusy] = useState(false);

  const checkIn = async (bookingId: string): Promise<CheckInResult> => {
    setBusy(true);
    try {
      const res = await api(`/v1/bookings/${bookingId}/checkin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        onDone();
        return { ok: true };
      }
      const parsed = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, message: messageFor(parsed.error, res.status) };
    } catch {
      return { ok: false, message: 'Falha de conexão. Tente de novo.' };
    } finally {
      setBusy(false);
    }
  };

  return { busy, checkIn };
}

function messageFor(code: string | undefined, status: number): string {
  if (code === 'not_started') return 'O check-in abre no dia da saída.';
  if (code === 'already_over') return 'Esta saída já terminou.';
  if (code === 'already_checked_in') return 'Vocês já fizeram o check-in.';
  if (code === 'not_confirmed') return 'O check-in abre quando a inscrição for confirmada.';
  if (code === 'cancelled') return 'Esta inscrição está cancelada.';
  if (status === 401 || status === 403) return 'Esta ação não é permitida para o seu acesso.';
  return 'Não deu para fazer o check-in. Tente de novo.';
}
