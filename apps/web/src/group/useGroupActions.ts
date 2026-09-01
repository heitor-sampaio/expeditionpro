import { useCallback, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Ações da mesa do grupo (GR-04/05/06 · IN-08/10/15/16). O hook só chama o backend e
 * devolve ok/erro; a regra (primeiro pagamento confirma, motivo obrigatório, etc.) é
 * toda do servidor. Ao concluir, quem chama pede refresh do board.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

export type DeletePaymentResult =
  | { ok: true; requiresDecision: boolean; remainingPayments: number }
  | { ok: false; message: string };

export interface PaymentInput {
  amountCents: number;
  method: 'pix' | 'boleto' | 'card' | 'cash';
  paidAt: string;
}

export interface BookingPayment {
  id: string;
  /** PG-08: o que o cliente pagou, quando maior que o que quita (taxa repassada). */
  customerPaidCents: number | null;
  /** PG-08: cobrança que originou este recebimento. */
  chargeId: string | null;
  /** payment (entrada) | refund (devolvido) | cashback (virou crédito) — §3.6. */
  kind: 'payment' | 'refund' | 'cashback';
  amountCents: number;
  method: string;
  paidAt: string;
  reference: string | null;
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

export function useGroupActions(refresh: () => void) {
  const [busy, setBusy] = useState(false);

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

  const deletePayment = useCallback(
    async (paymentId: string): Promise<DeletePaymentResult> => {
      setBusy(true);
      const res = await api(`/v1/payments/${paymentId}`, { method: 'DELETE' });
      setBusy(false);
      if (!res.ok) {
        const parsed = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, message: messageFor(parsed.error, res.status) };
      }
      const body = (await res.json()) as { requiresDecision: boolean; remainingPayments: number };
      refresh();
      return {
        ok: true,
        requiresDecision: body.requiresDecision,
        remainingPayments: body.remainingPayments,
      };
    },
    [refresh],
  );

  return {
    busy,
    registerPayment: (bookingId: string, input: PaymentInput) =>
      run(() => post(`/v1/bookings/${bookingId}/payments`, input)),
    // GR-04: desconto de balcão sobre o total, em percentual ou em reais. O rateio
    // entre os participantes é do servidor — conta de dinheiro não vive em componente.
    discountBooking: (
      bookingId: string,
      reason: string,
      mode: 'percent' | 'fixed',
      value: number,
    ) => run(() => post(`/v1/bookings/${bookingId}/discount`, { reason, mode, value })),
    // GR-04: desfaz o ajuste, voltando ao preço de tabela do roteiro para esta saída.
    restorePrice: (bookingId: string) =>
      run(() => post(`/v1/bookings/${bookingId}/restore-price`, {})),
    setInvoice: (bookingId: string, checked: boolean, invoiceNumber?: string) =>
      run(() => post(`/v1/bookings/${bookingId}/invoice`, { checked, invoiceNumber })),
    cancelBooking: (bookingId: string, reason: string) =>
      run(() => post(`/v1/bookings/${bookingId}/cancel`, { reason })),
    confirmManually: (bookingId: string, note: string) =>
      run(() => post(`/v1/bookings/${bookingId}/confirm`, { note })),
    // PG-02: emite a cobrança no ASAAS. Sem valor, cobra o que falta pagar.
    createCharge: (
      bookingId: string,
      input: {
        environment: 'sandbox' | 'production';
        billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
        dueDate: string;
        amountCents?: number;
        installments?: number;
      },
    ) => run(() => post(`/v1/bookings/${bookingId}/charges`, input)),
    // GR-14: quem embarcou. Desfazer é DELETE na mesma rota — é a mesma coisa, ao contrário.
    checkIn: (bookingId: string) => run(() => post(`/v1/bookings/${bookingId}/checkin`, {})),
    undoCheckIn: (bookingId: string) =>
      run(async () => {
        const res = await api(`/v1/bookings/${bookingId}/checkin`, { method: 'DELETE' });
        if (res.ok) return { ok: true } as const;
        const parsed = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false as const, message: messageFor(parsed.error, res.status) };
      }),
    registerRefund: (
      bookingId: string,
      input: {
        amountCents: number;
        destination: 'cash' | 'cashback';
        method?: string;
        paidAt: string;
        reason: string;
      },
    ) => run(() => post(`/v1/bookings/${bookingId}/refunds`, input)),
    deletePayment,
    listPayments: (bookingId: string): Promise<BookingPayment[]> =>
      api(`/v1/bookings/${bookingId}/payments`)
        .then((res) => (res.ok ? (res.json() as Promise<BookingPayment[]>) : []))
        .catch(() => []),
  };
}

function messageFor(code: string | undefined, status: number): string {
  const map: Record<string, string> = {
    invalid_amount: 'O valor precisa ser maior que zero.',
    booking_not_active: 'Inscrição cancelada não recebe pagamento.',
    already_cancelled: 'Esta inscrição já está cancelada.',
    not_pending: 'Só uma inscrição pendente pode ser confirmada assim.',
    booking_cancelled: 'Inscrição cancelada não é reprecificada.',
    negative_price: 'O valor precisa ser inteiro e não negativo.',
    no_overrides: 'Informe ao menos um valor a sobrepor.',
    forbidden: 'Seu perfil não permite esta ação.',
    refund_exceeds_received: 'A devolução não pode passar do que foi recebido.',
    required_field: 'Escreva o motivo da devolução.',
    not_started: 'O check-in abre no dia da saída.',
    already_over: 'A saída já terminou.',
    already_checked_in: 'Esta família já fez check-in.',
    not_checked_in: 'Esta inscrição não tem check-in.',
    not_confirmed: 'O check-in exige a inscrição confirmada.',
    cancelled: 'Inscrição cancelada não faz check-in.',
    gateway_not_connected: 'Conecte a conta do ASAAS em Configurações → Integrações.',
    nothing_due: 'Não há valor em aberto nesta inscrição.',
  };
  if (code && map[code]) return map[code];
  if (status === 401 || status === 403) return 'Seu perfil não permite esta ação.';
  if (status === 400 || status === 422) return 'Confira os dados antes de salvar.';
  return 'Não foi possível concluir. Tente de novo.';
}
