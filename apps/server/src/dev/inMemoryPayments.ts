import type {
  BookingConfirmation,
  BookingRecord,
  NewPayment,
  PaymentRecord,
  PaymentRepository,
} from '@expedition/application';

/**
 * Recebimentos em memória — SÓ para dev sem banco e testes de rota. Recebe as linhas de
 * inscrição para espelhar a confirmação atômica (IN-08) mudando o status do booking.
 */
export function inMemoryPayments(bookingRows: BookingRecord[]): PaymentRepository {
  const rows: (PaymentRecord & { tenantId: string; groupId: string | null; deleted: boolean })[] =
    [];
  let seq = 0;
  const active = (tenantId: string) => rows.filter((r) => r.tenantId === tenantId && !r.deleted);

  return {
    create(payment: NewPayment, confirmation: BookingConfirmation | null) {
      seq += 1;
      const index = bookingRows.findIndex((b) => b.id === payment.bookingId);
      const booking = index === -1 ? undefined : bookingRows[index];
      rows.push({
        id: `dev-pay-${seq}`,
        tenantId: payment.tenantId,
        bookingId: payment.bookingId,
        groupId: booking?.groupId ?? null,
        paidAt: payment.paidAt,
        amountCents: payment.amountCents,
        customerPaidCents: payment.customerPaidCents ?? null,
        chargeId: payment.chargeId ?? null,
        kind: payment.kind ?? 'payment',
        method: payment.method,
        reference: payment.reference,
        notes: payment.notes,
        deleted: false,
      });
      if (confirmation && booking && booking.status === 'pending') {
        bookingRows[index] = { ...booking, status: 'confirmed' };
      }
      return Promise.resolve({
        id: `dev-pay-${seq}`,
        bookingId: payment.bookingId,
        paidAt: payment.paidAt,
        amountCents: payment.amountCents,
        customerPaidCents: payment.customerPaidCents ?? null,
        chargeId: payment.chargeId ?? null,
        kind: payment.kind ?? 'payment',
        method: payment.method,
        reference: payment.reference,
        notes: payment.notes,
      });
    },
    listByBooking(tenantId: string, bookingId: string) {
      return Promise.resolve(active(tenantId).filter((r) => r.bookingId === bookingId));
    },
    listByGroup(tenantId: string, groupId: string) {
      return Promise.resolve(active(tenantId).filter((r) => r.groupId === groupId));
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
