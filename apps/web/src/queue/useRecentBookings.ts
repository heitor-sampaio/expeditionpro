import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * IN-17b — as últimas inscrições que entraram, de qualquer origem. Fica embaixo da fila:
 * a fila é o que **exige ação**; esta lista é o que já foi processado.
 */

export interface RecentBooking {
  bookingId: string;
  groupId: string;
  groupName: string;
  startDate: string;
  endDate: string;
  responsibleCustomerId: string;
  responsibleName: string;
  status: string;
  source: string;
  participantCount: number;
  contractedCents: number;
}

export type RecentState =
  { status: 'loading' } | { status: 'ready'; rows: RecentBooking[] } | { status: 'error' };

export function useRecentBookings() {
  const [state, setState] = useState<RecentState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api('/v1/bookings/recent?limit=20', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', rows: (await res.json()) as RecentBooking[] });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  useLiveRefresh('recent-bookings', [{ table: 'bookings' }], refresh);

  return { state, refresh };
}
