import { useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * §5.8 — os pedidos de inscrição do cliente que ainda aguardam a revisão da equipe. Sem
 * isto o cliente pede e some: a inscrição só aparece na ficha depois de alocada.
 */

export interface PendingRequest {
  id: string;
  groupId: string;
  participantCount: number;
  requestedAt: string;
}

export function usePendingRequests(): PendingRequest[] {
  const [rows, setRows] = useState<PendingRequest[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api('/v1/portal/enrollment-requests', { signal: controller.signal })
      .then(async (res) => setRows(res.ok ? ((await res.json()) as PendingRequest[]) : []))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setRows([]);
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Ao vivo: quando a equipe aprova, o pedido sai da lista e a inscrição aparece na ficha.
  useLiveRefresh('portal-requests', [{ table: 'intake_events' }], () => setReloadKey((k) => k + 1));

  return rows;
}
