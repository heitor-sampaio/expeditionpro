import type {
  BookingCancellation,
  BookingInvoice,
  BookingRecord,
  BookingRepository,
  CashbackSnapshot,
  GroupBookingCounts,
  ManualConfirmation,
  NewBooking,
  ParticipantPriceOverride,
  ParticipantTablePrice,
} from '@expedition/application';
import { cents, type LocalDate, type PriceCategory } from '@expedition/domain';
import type {
  Booking as PrismaBooking,
  BookingParticipant as PrismaParticipant,
  CouponRedemption as PrismaRedemption,
  Prisma,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { runInTransaction, tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma de inscrições. `create` é atômico (inscrição + participantes
 * num `$transaction`, IN-18) com tenant_id explícito. Valor unitário: `Cents` (domínio)
 * ↔ BigInt centavos (banco, §3.6). O total não é persistido — é a soma dos unitários.
 */
export function prismaBookingRepository(base: PrismaClient): BookingRepository {
  return {
    async create(booking: NewBooking): Promise<BookingRecord> {
      const created = await runInTransaction(base, async (tx) => {
        const row = await tx.booking.create({
          data: {
            tenantId: booking.tenantId,
            groupId: booking.groupId,
            responsibleCustomerId: booking.responsibleCustomerId,
            status: booking.status,
            source: booking.source,
            ...(booking.cashbackRuleSnapshot
              ? {
                  cashbackRuleSnapshot:
                    booking.cashbackRuleSnapshot as unknown as Prisma.InputJsonValue,
                }
              : {}),
          },
        });
        const participants = await Promise.all(
          booking.participants.map((participant) =>
            tx.bookingParticipant.create({
              data: {
                tenantId: booking.tenantId,
                bookingId: row.id,
                customerId: participant.customerId,
                priceCategory: participant.priceCategory,
                unitPriceCents: BigInt(participant.unitPriceCents),
                priceSource: participant.priceSource,
                priceNote: participant.priceNote,
              },
            }),
          ),
        );
        return { row, participants };
      });
      return toBookingRecord({
        ...created.row,
        participants: created.participants,
        couponRedemptions: [],
      });
    },

    async existsForResponsible(
      tenantId: string,
      groupId: string,
      responsibleCustomerId: string,
    ): Promise<boolean> {
      const found = await tenantClient(base, tenantId).booking.findFirst({
        where: { groupId, responsibleCustomerId, deletedAt: null },
        select: { id: true },
      });
      return found !== null;
    },

    async findById(tenantId: string, bookingId: string): Promise<BookingRecord | null> {
      const row = await tenantClient(base, tenantId).booking.findUnique({
        where: { id: bookingId },
        include: BOOKING_INCLUDE,
      });
      return row ? toBookingRecord(row) : null;
    },

    async listByGroup(tenantId: string, groupId: string): Promise<BookingRecord[]> {
      const rows = await tenantClient(base, tenantId).booking.findMany({
        where: { groupId, deletedAt: null },
        include: BOOKING_INCLUDE,
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((row) => toBookingRecord(row));
    },

    async listByCustomer(tenantId: string, customerId: string): Promise<BookingRecord[]> {
      const rows = await tenantClient(base, tenantId).booking.findMany({
        where: {
          deletedAt: null,
          OR: [{ responsibleCustomerId: customerId }, { participants: { some: { customerId } } }],
        },
        include: BOOKING_INCLUDE,
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((row) => toBookingRecord(row));
    },

    async listRecent(tenantId: string, limit: number): Promise<BookingRecord[]> {
      const rows = await tenantClient(base, tenantId).booking.findMany({
        where: { deletedAt: null },
        include: BOOKING_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return rows.map((row) => toBookingRecord(row));
    },

    async applyParticipantOverrides(
      tenantId: string,
      bookingId: string,
      overrides: readonly ParticipantPriceOverride[],
    ): Promise<BookingRecord> {
      const updated = await runInTransaction(base, async (tx) => {
        await Promise.all(
          overrides.map((override) =>
            tx.bookingParticipant.updateMany({
              where: { tenantId, bookingId, customerId: override.customerId },
              data: {
                unitPriceCents: BigInt(override.unitPriceCents),
                priceSource: 'override',
                priceNote: override.priceNote,
              },
            }),
          ),
        );
        return tx.booking.findFirstOrThrow({
          where: { id: bookingId, tenantId },
          include: BOOKING_INCLUDE,
        });
      });
      return toBookingRecord(updated);
    },

    async restoreParticipantTablePrices(
      tenantId: string,
      bookingId: string,
      prices: readonly ParticipantTablePrice[],
    ): Promise<BookingRecord> {
      const updated = await runInTransaction(base, async (tx) => {
        await Promise.all(
          prices.map((price) =>
            tx.bookingParticipant.updateMany({
              where: { tenantId, bookingId, customerId: price.customerId },
              data: {
                unitPriceCents: BigInt(price.unitPriceCents),
                priceCategory: price.priceCategory,
                priceSource: 'auto',
                priceNote: null,
              },
            }),
          ),
        );
        return tx.booking.findFirstOrThrow({
          where: { id: bookingId, tenantId },
          include: BOOKING_INCLUDE,
        });
      });
      return toBookingRecord(updated);
    },

    async confirmManually(
      tenantId: string,
      bookingId: string,
      confirmation: ManualConfirmation,
    ): Promise<BookingRecord> {
      await tenantClient(base, tenantId).booking.update({
        where: { id: bookingId },
        data: {
          status: 'confirmed',
          confirmedBy: confirmation.confirmedBy,
          confirmedAt: confirmation.confirmedAt,
          confirmedNote: confirmation.note,
        },
      });
      const row = await tenantClient(base, tenantId).booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: BOOKING_INCLUDE,
      });
      return toBookingRecord(row);
    },

    async cancel(
      tenantId: string,
      bookingId: string,
      cancellation: BookingCancellation,
    ): Promise<BookingRecord> {
      await tenantClient(base, tenantId).booking.update({
        where: { id: bookingId },
        data: {
          status: 'cancelled',
          cancelledBy: cancellation.cancelledBy,
          cancelledAt: cancellation.cancelledAt,
          cancelledReason: cancellation.reason,
        },
      });
      const row = await tenantClient(base, tenantId).booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: BOOKING_INCLUDE,
      });
      return toBookingRecord(row);
    },

    async setCheckedIn(
      tenantId: string,
      bookingId: string,
      at: Date | null,
      by: string | null,
    ): Promise<BookingRecord> {
      const row = await tenantClient(base, tenantId).booking.update({
        where: { id: bookingId },
        data: { checkedInAt: at, checkedInBy: by },
        include: BOOKING_INCLUDE,
      });
      return toBookingRecord(row);
    },

    async setInvoiceCheck(
      tenantId: string,
      bookingId: string,
      invoice: BookingInvoice,
    ): Promise<BookingInvoice> {
      const row = await tenantClient(base, tenantId).booking.update({
        where: { id: bookingId },
        data: {
          invoiceChecked: invoice.checked,
          invoiceCheckedBy: invoice.checkedBy,
          invoiceCheckedAt: invoice.checkedAt,
          invoiceNumber: invoice.invoiceNumber,
          invoiceIssuedAt: invoice.invoiceIssuedAt
            ? localDateToDate(invoice.invoiceIssuedAt)
            : null,
        },
      });
      return {
        checked: row.invoiceChecked,
        checkedBy: row.invoiceCheckedBy,
        checkedAt: row.invoiceCheckedAt,
        invoiceNumber: row.invoiceNumber,
        invoiceIssuedAt: row.invoiceIssuedAt ? dateToLocalDate(row.invoiceIssuedAt) : null,
      };
    },

    async countByGroup(tenantId: string): Promise<GroupBookingCounts[]> {
      const grouped = await tenantClient(base, tenantId).booking.groupBy({
        by: ['groupId', 'status'],
        where: { deletedAt: null, status: { in: ['confirmed', 'pending'] } },
        _count: { _all: true },
      });
      const byGroup = new Map<string, { confirmedCount: number; pendingCount: number }>();
      for (const row of grouped) {
        const acc = byGroup.get(row.groupId) ?? { confirmedCount: 0, pendingCount: 0 };
        const n = row._count._all;
        if (row.status === 'confirmed') acc.confirmedCount += n;
        else if (row.status === 'pending') acc.pendingCount += n;
        byGroup.set(row.groupId, acc);
      }
      return [...byGroup].map(([groupId, c]) => ({ groupId, ...c }));
    },
  };
}

function localDateToDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function dateToLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * CP-05: o desconto vem junto da inscrição, do resgate ativo. Carregar aqui é o que
 * faz toda leitura de dinheiro (mesa, financeiro, cashback, cobrança) enxergar o cupom
 * sem que cada caso de uso precise conhecer a tabela.
 */
const BOOKING_INCLUDE = {
  participants: true,
  couponRedemptions: { where: { releasedAt: null } },
} as const;

interface BookingRow extends PrismaBooking {
  readonly participants: PrismaParticipant[];
  readonly couponRedemptions: PrismaRedemption[];
}

function toBookingRecord(row: BookingRow): BookingRecord {
  const participants = row.participants;
  const redemption = row.couponRedemptions[0];
  return {
    id: row.id,
    groupId: row.groupId,
    responsibleCustomerId: row.responsibleCustomerId,
    status: row.status,
    source: row.source,
    invoiceChecked: row.invoiceChecked,
    checkedInAt: row.checkedInAt,
    cashbackRuleSnapshot: row.cashbackRuleSnapshot
      ? (row.cashbackRuleSnapshot as unknown as CashbackSnapshot)
      : null,
    discount: redemption
      ? {
          couponId: redemption.couponId,
          code: redemption.code,
          discountCents: cents(Number(redemption.discountCents)),
        }
      : null,
    participants: participants.map((participant) => ({
      id: participant.id,
      customerId: participant.customerId,
      priceCategory: participant.priceCategory as PriceCategory,
      unitPriceCents: cents(Number(participant.unitPriceCents)),
      priceSource: participant.priceSource,
      priceNote: participant.priceNote,
    })),
  };
}
