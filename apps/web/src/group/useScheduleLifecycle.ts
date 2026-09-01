import { useState } from 'react';
import { api } from '../auth/api.js';
import { scheduleErrorFor } from './scheduleActions.js';

/**
 * Ciclo de vida da saída (AG-04/AG-05): editar datas, cancelar e excluir. As guardas
 * (lançamento existente, papel, estado) são do servidor; aqui só a chamada e a frase.
 */

export type LifecycleResult = { ok: true } | { ok: false; message: string };

export function useScheduleLifecycle() {
  const [busy, setBusy] = useState(false);

  const call = async (
    path: string,
    method: 'PATCH' | 'POST' | 'DELETE',
    body?: unknown,
  ): Promise<LifecycleResult> => {
    setBusy(true);
    try {
      const res = await api(path, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (res.ok) return { ok: true };
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, message: scheduleErrorFor(payload.error ?? '') };
    } catch {
      return { ok: false, message: scheduleErrorFor('network') };
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    /** AG-04 — novas datas; o nome do grupo acompanha, e o preço já congelado não muda. */
    editDates: (eventId: string, startDate: string, endDate: string) =>
      call(`/v1/schedule-events/${eventId}`, 'PATCH', { startDate, endDate }),
    /** AG-05 — cancela a saída: ela some da vitrine, mas continua na agenda. */
    cancel: (groupId: string, reason: string) =>
      call(`/v1/groups/${groupId}/cancel`, 'POST', { reason }),
    /** AG-05 — exclui de vez; o servidor recusa se houver qualquer lançamento. */
    remove: (eventId: string) => call(`/v1/schedule-events/${eventId}`, 'DELETE'),
  };
}
