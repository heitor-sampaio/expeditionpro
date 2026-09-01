import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * PG-06 — as cobranças emitidas para uma inscrição. Fica ao lado dos recebimentos: a
 * cobrança é a promessa, o recebimento é o dinheiro.
 */

export interface ChargeRow {
  id: string;
  externalId: string;
  amountCents: number;
  netAmountCents: number;
  feeCents: number;
  installments: number;
  billingType: string;
  dueDate: string;
  status: string;
  invoiceUrl: string | null;
  paidAt: string | null;
  createdAt: string;
  /** PG-07: o realizado, quando já conciliada. */
  settledGrossCents: number | null;
  settledNetCents: number | null;
  awaitingCreditCents: number | null;
  anticipationFeeCents: number | null;
  paidInstallments: number | null;
  creditedInstallments: number | null;
  nextCreditDate: string | null;
  reconciledAt: string | null;
}

export function useBookingCharges(bookingId: string, reloadKey = 0) {
  const [rows, setRows] = useState<ChargeRow[] | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api(`/v1/bookings/${bookingId}/charges`, { signal: controller.signal })
      .then(async (res) => setRows(res.ok ? ((await res.json()) as ChargeRow[]) : []))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setRows([]);
      });
    return () => controller.abort();
  }, [bookingId, reloadKey, bump]);

  const refresh = useCallback(() => setBump((k) => k + 1), []);

  /**
   * PG-07 — pergunta ao ASAAS o que caiu de fato nesta cobrança. É sob demanda porque
   * consulta a API do provedor: um botão por linha, não uma varredura a cada abertura.
   */
  const [reconciling, setReconciling] = useState<string | null>(null);
  const reconcile = useCallback(
    async (chargeId: string) => {
      setReconciling(chargeId);
      try {
        await api(`/v1/charges/${chargeId}/reconcile`, { method: 'POST' });
        refresh();
      } finally {
        setReconciling(null);
      }
    },
    [refresh],
  );

  // Ao vivo: o webhook do provedor muda o estado da cobrança sem ninguém clicar aqui.
  useLiveRefresh(`charges-${bookingId}`, [{ table: 'payment_charges' }], refresh);

  return { rows, refresh, reconcile, reconciling };
}
