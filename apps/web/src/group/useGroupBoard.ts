import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * Mesa do grupo — Tabela 1 (GR-07/GR-13). O hook lê o board; contratado, recebido e os
 * totais confirmado/projetado vêm derivados do servidor.
 */

export interface BoardParticipant {
  customerId: string;
  fullName: string;
  priceCategory: string;
  unitPriceCents: number;
}

/** GR-14: o carro da família, já resolvido pelo servidor. */
export interface BoardVehicle {
  model: string | null;
  plate: string;
}

export interface BoardRow {
  bookingId: string;
  responsibleCustomerId: string;
  responsibleName: string;
  status: string;
  contractedCents: number;
  /** PG-08: o que quitou a inscrição — já líquido, porque a taxa é do cliente. */
  receivedCents: number;
  dueCents: number;
  occupiesVehicle: boolean;
  invoiceChecked: boolean;
  checkedInAt: string | null;
  vehicle: BoardVehicle | null;
  /** CP-05: cupom aplicado nesta inscrição. Null = valor cheio. */
  coupon: BoardCoupon | null;
  /** GR-04: a linha teve o preço ajustado à mão — habilita a volta ao preço de tabela. */
  priceAdjusted: boolean;
  participants: BoardParticipant[];
}

export interface BoardCoupon {
  code: string;
  discountCents: number;
}

export interface BoardView {
  group: {
    id: string;
    scheduleEventId: string | null;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    visibility: string;
    pricingMode: string;
  };
  rows: BoardRow[];
  totals: {
    contractedConfirmedCents: number;
    contractedProjectedCents: number;
    receivedCents: number;
    dueConfirmedCents: number;
    dueProjectedCents: number;
    confirmedCount: number;
    pendingCount: number;
    /** PG-08: o que os clientes pagaram — maior que o recebido quando a taxa é repassada. */
    customerPaidCents: number;
  };
  occupancy: {
    capacityVehicles: number | null;
    occupiedVehicles: number;
    vacancies: number | null;
  };
}

export type BoardState =
  { status: 'loading' } | { status: 'ready'; board: BoardView } | { status: 'error' };

export function useGroupBoard(groupId: string) {
  const [state, setState] = useState<BoardState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api(`/v1/groups/${groupId}/board`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<BoardView>;
      })
      .then((board) => setState({ status: 'ready', board }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [groupId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Ao vivo: outra pessoa da equipe alocando, recebendo ou cancelando aparece aqui sozinho.
  // Recebimento não tem group_id, então vem sem filtro — o coalesce segura a rajada.
  useLiveRefresh(
    `board-${groupId}`,
    [
      { table: 'bookings', filter: `group_id=eq.${groupId}` },
      { table: 'booking_participants' },
      { table: 'booking_payments' },
    ],
    refresh,
  );

  return { state, refresh };
}
