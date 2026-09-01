import type { AsaasChargeStatus } from '@expedition/domain';
import type {
  ChargeSettlement,
  NewPaymentCharge,
  PaymentChargeRecord,
  PaymentChargeRepository,
} from './paymentChargeRepository.js';

/** Fake in-memory das cobranças. Excluído do build (`*.fake.ts`). */
export function fakePaymentChargeRepository(): PaymentChargeRepository & {
  rows: PaymentChargeRecord[];
} {
  const rows: PaymentChargeRecord[] = [];
  let seq = 0;

  const replace = (chargeId: string, patch: Partial<PaymentChargeRecord>) => {
    const index = rows.findIndex((r) => r.id === chargeId);
    if (index < 0) return Promise.reject(new Error('cobrança não encontrada'));
    const updated = { ...rows[index]!, ...patch };
    rows[index] = updated;
    return Promise.resolve(updated);
  };

  return {
    rows,
    create(charge: NewPaymentCharge) {
      seq += 1;
      const record: PaymentChargeRecord = {
        id: `charge-${seq}`,
        bookingId: charge.bookingId,
        provider: charge.provider,
        environment: charge.environment,
        externalId: charge.externalId,
        installmentExternalId: charge.installmentExternalId,
        amountCents: charge.amountCents,
        netAmountCents: charge.netAmountCents,
        installments: charge.installments,
        billingType: charge.billingType,
        dueDate: charge.dueDate,
        status: charge.status,
        invoiceUrl: charge.invoiceUrl,
        bookingPaymentId: null,
        paidAt: null,
        createdAt: new Date(seq * 1000),
        settledGrossCents: null,
        settledNetCents: null,
        awaitingCreditCents: null,
        anticipationFeeCents: null,
        paidInstallments: null,
        creditedInstallments: null,
        nextCreditDate: null,
        reconciledAt: null,
      };
      rows.push(record);
      return Promise.resolve(record);
    },
    findByExternalId(
      _tenantId: string,
      provider: string,
      externalId: string,
      installmentExternalId?: string | null,
    ) {
      return Promise.resolve(
        rows.find(
          (r) =>
            r.provider === provider &&
            (r.externalId === externalId ||
              (installmentExternalId !== null &&
                installmentExternalId !== undefined &&
                r.installmentExternalId === installmentExternalId)),
        ) ?? null,
      );
    },
    findById(_tenantId: string, chargeId: string) {
      return Promise.resolve(rows.find((r) => r.id === chargeId) ?? null);
    },
    saveSettlement(_tenantId: string, chargeId: string, settlement: ChargeSettlement) {
      return replace(chargeId, settlement);
    },
    listRecent(_tenantId: string, limit: number) {
      return Promise.resolve([...rows].reverse().slice(0, limit));
    },
    listByBookings(_tenantId: string, bookingIds: readonly string[]) {
      const wanted = new Set(bookingIds);
      return Promise.resolve(rows.filter((r) => wanted.has(r.bookingId)));
    },
    listByBooking(_tenantId: string, bookingId: string) {
      return Promise.resolve(rows.filter((r) => r.bookingId === bookingId));
    },
    markSettled(_tenantId: string, chargeId: string, bookingPaymentId: string, paidAt: Date) {
      return replace(chargeId, { bookingPaymentId, paidAt, status: 'received' });
    },
    setStatus(_tenantId: string, chargeId: string, status: AsaasChargeStatus) {
      return replace(chargeId, { status });
    },
  };
}
