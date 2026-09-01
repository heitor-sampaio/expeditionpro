import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * Dados do painel do cliente (§3.7): as inscrições dele e o saldo de cashback, lidos de
 * /v1/customers/:id/file (mesmo endpoint da ficha). Sem cálculo aqui — o servidor deriva
 * contratado/recebido/a receber e o saldo; a tela só escolhe a próxima e mostra.
 */

export interface HomeExpedition {
  bookingId: string;
  groupId: string;
  groupName: string;
  startDate: string;
  endDate: string;
  status: string;
  participantCount: number;
  /** GR-14: quando a família embarcou; null enquanto não fez check-in. */
  checkedInAt: string | null;
  contractedCents: number;
  receivedCents: number;
  dueCents: number;
}

export interface HomeData {
  balanceCents: number;
  expeditions: HomeExpedition[];
}

export type HomeState =
  { status: 'loading' } | { status: 'ready'; data: HomeData } | { status: 'error' };

interface FileResponse {
  expeditions: HomeExpedition[];
  cashback: { balanceCents: number };
}

export function usePortalHome(customerId: string) {
  const [state, setState] = useState<HomeState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api(`/v1/customers/${customerId}/file`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<FileResponse>;
      })
      .then((file) =>
        setState({
          status: 'ready',
          data: { balanceCents: file.cashback.balanceCents, expeditions: file.expeditions },
        }),
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [customerId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Ao vivo: a equipe aprova o pedido e a inscrição aparece aqui; lança o primeiro
  // recebimento e ela vira confirmada; cancela e ela sai — tudo sem o cliente dar F5.
  // A RLS entrega só as linhas da própria família (§3.7).
  useLiveRefresh(
    'portal-home',
    [
      { table: 'bookings' },
      { table: 'booking_participants' },
      { table: 'booking_payments' },
      { table: 'cashback_entries' },
      { table: 'groups' },
    ],
    refresh,
  );

  return { state, refresh };
}
