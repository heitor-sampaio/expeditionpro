import type {
  BookingConfirmation,
  NewPayment,
  PaymentRecord,
  PaymentRepository,
} from './paymentRepository.js';
import type { BookingRecord } from '../bookings/bookingRepository.js';

/**
 * Fake in-memory do port de recebimentos. Excluído do build (`*.fake.ts`).
 * Aceita as linhas de booking do fake de inscrições para espelhar a confirmação
 * atômica (IN-08) — como faria a transação real.
 */
export function fakePaymentRepository(bookingRows?: BookingRecord[]): PaymentRepository & {
  rows: (PaymentRecord & { tenantId: string; deleted: boolean })[];
} {
  const rows: (PaymentRecord & { tenantId: string; deleted: boolean })[] = [];
  let seq = 0;

  const active = (tenantId: string) => rows.filter((r) => r.tenantId === tenantId && !r.deleted);

  return {
    rows,
    create(payment: NewPayment, confirmation: BookingConfirmation | null) {
      seq += 1;
      const record = {
        id: `pay-${seq}`,
        tenantId: payment.tenantId,
        bookingId: payment.bookingId,
        paidAt: payment.paidAt,
        amountCents: payment.amountCents,
        kind: payment.kind ?? 'payment',
        customerPaidCents: payment.customerPaidCents ?? null,
        chargeId: payment.chargeId ?? null,
        method: payment.method,
        reference: payment.reference,
        notes: payment.notes,
        deleted: false,
      };
      rows.push(record);
      if (confirmation && bookingRows) {
        const index = bookingRows.findIndex(
          (b) => b.id === payment.bookingId && b.status === 'pending',
        );
        if (index !== -1) {
          bookingRows[index] = { ...bookingRows[index]!, status: 'confirmed' };
        }
      }
      return Promise.resolve(record);
    },
    listByBooking(tenantId: string, bookingId: string) {
      return Promise.resolve(active(tenantId).filter((r) => r.bookingId === bookingId));
    },
    listByGroup(tenantId: string, groupId: string) {
      // Filtra pelos recebimentos das inscrições daquele grupo (como o repo real via join).
      const ids = new Set(
        (bookingRows ?? []).filter((b) => b.groupId === groupId).map((b) => b.id),
      );
      return Promise.resolve(active(tenantId).filter((r) => ids.has(r.bookingId)));
    },
    findById(tenantId: string, paymentId: string) {
      return Promise.resolve(active(tenantId).find((r) => r.id === paymentId) ?? null);
    },
    softDelete(tenantId: string, paymentId: string) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === paymentId);
      if (index !== -1) rows[index] = { ...rows[index]!, deleted: true };
      return Promise.resolve();
    },
    countActiveByBooking(tenantId: string, bookingId: string) {
      return Promise.resolve(active(tenantId).filter((r) => r.bookingId === bookingId).length);
    },
  };
}
