import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * Dashboard operacional (§3.6). Confirmado × projetado, a receber, pendências e próximas
 * saídas — tudo derivado no servidor. Só a equipe.
 */

export interface UpcomingGroupDto {
  groupId: string;
  groupName: string;
  startDate: string;
  endDate: string;
  confirmedCount: number;
  pendingCount: number;
  capacityVehicles: number | null;
}

export interface Dashboard {
  confirmedRevenueCents: number;
  projectedRevenueCents: number;
  receivedCents: number;
  dueCents: number;
  pendingIntakeCount: number;
  pendingBookingCount: number;
  upcoming: UpcomingGroupDto[];
}

export type DashboardState =
  { status: 'loading' } | { status: 'ready'; dashboard: Dashboard } | { status: 'error' };

export function useDashboard() {
  const [state, setState] = useState<DashboardState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/reports/dashboard', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<Dashboard>;
      })
      .then((dashboard) => setState({ status: 'ready', dashboard }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Ao vivo: o painel conta pendência de fila e de inscrição e soma o recebido — os três
  // números mudam a cada passo do funil.
  useLiveRefresh(
    'dashboard',
    [
      { table: 'intake_events' },
      { table: 'bookings' },
      { table: 'booking_payments' },
      { table: 'schedule_events' },
    ],
    refresh,
  );

  return { state, refresh };
}
