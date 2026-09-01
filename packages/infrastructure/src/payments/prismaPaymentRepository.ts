import type {
  BookingConfirmation,
  NewPayment,
  PaymentRecord,
  PaymentRepository,
} from '@expedition/application';
import { cents, type LocalDate } from '@expedition/domain';
import type { BookingPayment as PrismaPayment } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma de recebimentos. `create` é atômico (IN-08): insere o
 * recebimento e, quando há confirmação, muda a inscrição de `pending` para `confirmed`
 * na mesma transação — só se ainda estiver pending (guarda de corrida). Valor: `Cents`
 * (domínio) ↔ BigInt centavos (banco, §3.6); `paid_at` é `@db.Date` (LocalDate ↔ UTC).
 */
export function prismaPaymentRepository(base: PrismaClient): PaymentRepository {
  return {
    async create(
      payment: NewPayment,
      confirmation: BookingConfirmation | null,
    ): Promise<PaymentRecord> {
      const row = await base.$transaction(async (tx) => {
        const created = await tx.bookingPayment.create({
          data: {
            tenantId: payment.tenantId,
            bookingId: payment.bookingId,
            paidAt: localDateToDate(payment.paidAt),
            amountCents: BigInt(payment.amountCents),
            customerPaidCents:
              payment.customerPaidCents === undefined ? null : BigInt(payment.customerPaidCents),
            chargeId: payment.chargeId ?? null,
            kind: payment.kind ?? 'payment',
            method: payment.method,
            reference: payment.reference,
            notes: payment.notes,
            createdBy: payment.createdBy,
          },
        });
        if (confirmation) {
          await tx.booking.updateMany({
            where: { id: payment.bookingId, tenantId: payment.tenantId, status: 'pending' },
            data: {
              status: 'confirmed',
              confirmedBy: confirmation.confirmedBy,
              confirmedAt: confirmation.confirmedAt,
            },
          });
        }
        return created;
      });
      return toPaymentRecord(row);
    },

    async listByBooking(tenantId: string, bookingId: string): Promise<PaymentRecord[]> {
      const rows = await tenantClient(base, tenantId).bookingPayment.findMany({
        where: { bookingId, deletedAt: null },
        orderBy: { paidAt: 'asc' },
      });
      return rows.map(toPaymentRecord);
    },

    async listByGroup(tenantId: string, groupId: string): Promise<PaymentRecord[]> {
      const rows = await tenantClient(base, tenantId).bookingPayment.findMany({
        where: { deletedAt: null, booking: { groupId } },
        orderBy: { paidAt: 'asc' },
      });
      return rows.map(toPaymentRecord);
    },

    async findById(tenantId: string, paymentId: string): Promise<PaymentRecord | null> {
      const row = await tenantClient(base, tenantId).bookingPayment.findFirst({
        where: { id: paymentId, deletedAt: null },
      });
      return row ? toPaymentRecord(row) : null;
    },

    async softDelete(tenantId: string, paymentId: string): Promise<void> {
      await tenantClient(base, tenantId).bookingPayment.updateMany({
        where: { id: paymentId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    },

    async countActiveByBooking(tenantId: string, bookingId: string): Promise<number> {
      return tenantClient(base, tenantId).bookingPayment.count({
        where: { bookingId, deletedAt: null },
      });
    },
  };
}

function toPaymentRecord(row: PrismaPayment): PaymentRecord {
  return {
    id: row.id,
    bookingId: row.bookingId,
    paidAt: dateToLocalDate(row.paidAt),
    amountCents: cents(Number(row.amountCents)),
    customerPaidCents: row.customerPaidCents === null ? null : Number(row.customerPaidCents),
    chargeId: row.chargeId,
    kind: row.kind as PaymentRecord['kind'],
    method: row.method,
    reference: row.reference,
    notes: row.notes,
  };
}

function localDateToDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function dateToLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
