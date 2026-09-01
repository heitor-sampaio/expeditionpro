import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * Fila de alocação (§5.7.2). O hook lê a fila (resumo com CPF já mascarado pelo servidor)
 * e a lista de grupos-alvo, e expõe alocar/descartar. A regra é toda do backend.
 */

export interface QueueItem {
  id: string;
  externalId: string | null;
  formId: string | null;
  status: string;
  responsibleName: string;
  responsibleCpf: string;
  companionCount: number;
  desiredDate: string | null;
  receivedAt: string;
  warnings: string[];
  source: string;
  /** §5.8: saída escolhida pelo cliente no app; null quando veio do formulário. */
  chosenGroupId: string | null;
}

export interface GroupOption {
  id: string;
  name: string;
  startDate: string;
}

export type QueueState =
  | { status: 'loading' }
  | { status: 'ready'; items: QueueItem[]; groups: GroupOption[] }
  | { status: 'error' };

export type ActionResult = { ok: true } | { ok: false; message: string };

export function useQueue() {
  const [state, setState] = useState<QueueState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    Promise.all([
      api('/v1/intake', { signal: controller.signal }).then(json<QueueItem[]>),
      api('/v1/schedule-events', { signal: controller.signal }).then(json<ScheduleEventDto[]>),
    ])
      .then(([items, events]) => {
        const groups = events.map((e) => ({
          id: e.group.id,
          name: e.group.name,
          startDate: e.startDate,
        }));
        setState({ status: 'ready', items, groups });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Ao vivo: inscrição que chega pelo site (IN-17) entra na fila sem F5, e o que outra
  // pessoa aloca sai da lista.
  useLiveRefresh(
    'intake-queue',
    [
      { table: 'intake_events' },
      { table: 'bookings' },
      // a lista de saídas-alvo é da agenda: saída nova aparece no seletor, saída
      // excluída some dele.
      { table: 'schedule_events' },
      { table: 'groups' },
    ],
    refresh,
  );

  const run = useCallback(
    async (fn: () => Promise<ActionResult>): Promise<ActionResult> => {
      setBusy(true);
      const result = await fn();
      setBusy(false);
      if (result.ok) refresh();
      return result;
    },
    [refresh],
  );

  const allocate = (intakeId: string, groupId: string) =>
    run(() => post(`/v1/intake/${intakeId}/allocate`, { groupId }));
  const discard = (intakeId: string, reason: string) =>
    run(() => post(`/v1/intake/${intakeId}/discard`, { reason }));

  return { state, refresh, busy, allocate, discard };
}

interface ScheduleEventDto {
  startDate: string;
  group: { id: string; name: string };
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

async function post(url: string, body: unknown): Promise<ActionResult> {
  const res = await api(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const parsed = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, message: messageFor(parsed.error, res.status) };
}

function messageFor(code: string | undefined, status: number): string {
  if (code === 'not_allocatable') return 'Esta inscrição já saiu da fila.';
  if (code === 'not_found') return 'Grupo não encontrado.';
  if (code === 'already_allocated') return 'Esse responsável já tem inscrição no grupo.';
  if (status === 400 || status === 422) return 'Confira a seleção antes de alocar.';
  return 'Não foi possível concluir. Tente de novo.';
}
