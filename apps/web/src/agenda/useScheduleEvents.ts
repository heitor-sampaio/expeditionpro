import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * Agenda (AG-01/AG-02). O hook orquestra a leitura dos eventos e a criação; toda a
 * regra (evento gera grupo, faixa/preço na alocação) vive no servidor.
 */

export interface EventOccupancy {
  capacityVehicles: number | null;
  confirmedCount: number;
  pendingCount: number;
  vacancies: number | null;
}

export interface ScheduleEventDto {
  id: string;
  itineraryId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  title: string | null;
  status: string;
  group: {
    id: string;
    name: string;
    status: string;
    capacityVehicles: number | null;
    visibility: string;
    pricingMode: string;
  };
  occupancy: EventOccupancy;
}

export type AgendaState =
  { status: 'loading' } | { status: 'ready'; events: ScheduleEventDto[] } | { status: 'error' };

export interface NewEventInput {
  itineraryId: string;
  startDate: string;
  endDate: string;
  title?: string;
  capacityVehicles?: number;
}

export function useScheduleEvents() {
  const [state, setState] = useState<AgendaState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/schedule-events', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<ScheduleEventDto[]>;
      })
      .then((events) => setState({ status: 'ready', events }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Ao vivo: saída criada, cancelada ou excluída por outra pessoa da equipe, e a
  // ocupação de cada uma — que muda a cada inscrição alocada ou confirmada.
  useLiveRefresh(
    'agenda-events',
    [{ table: 'schedule_events' }, { table: 'groups' }, { table: 'bookings' }],
    refresh,
  );

  const createEvent = useCallback(
    async (input: NewEventInput): Promise<{ ok: true } | { ok: false; message: string }> => {
      const res = await api('/v1/schedule-events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        refresh();
        return { ok: true };
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, message: messageFor(body.error, res.status) };
    },
    [refresh],
  );

  return { state, refresh, createEvent };
}

function messageFor(code: string | undefined, status: number): string {
  if (code === 'invalid_date_range') return 'A data de término não pode ser anterior à de início.';
  if (code === 'not_found') return 'Roteiro não encontrado.';
  if (status === 400 || status === 422) return 'Confira os dados do evento antes de salvar.';
  return 'Não foi possível criar o evento. Tente de novo.';
}
