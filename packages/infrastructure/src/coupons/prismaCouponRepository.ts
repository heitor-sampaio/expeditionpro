import type {
  CouponPatch,
  CouponRecord,
  CouponRepository,
  CouponUses,
  NewCoupon,
  NewRedemption,
  RedemptionRecord,
} from '@expedition/application';
import { cents, type CouponMode, type LocalDate } from '@expedition/domain';
import type {
  Coupon as PrismaCoupon,
  CouponRedemption as PrismaRedemption,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma de cupons (§5.15). Duas travas moram no banco e não aqui: o
 * código único por tenant e o índice parcial que impede dois resgates ativos na mesma
 * inscrição. O uso é sempre `count` dos resgates ativos — nunca coluna (CP-04).
 */
export function prismaCouponRepository(base: PrismaClient): CouponRepository {
  return {
    async create(coupon: NewCoupon): Promise<CouponRecord> {
      const row = await tenantClient(base, coupon.tenantId).coupon.create({
        data: {
          tenantId: coupon.tenantId,
          code: coupon.code,
          description: coupon.description,
          mode: coupon.mode,
          value: BigInt(coupon.value),
          active: coupon.active,
          validFrom: toDate(coupon.validFrom),
          validUntil: toDate(coupon.validUntil),
          maxUses: coupon.maxUses,
          maxUsesPerCustomer: coupon.maxUsesPerCustomer,
          itineraryId: coupon.itineraryId,
          groupId: coupon.groupId,
          customerId: coupon.customerId,
          createdBy: coupon.createdBy,
        },
      });
      return toCouponRecord(row);
    },

    async update(tenantId: string, couponId: string, patch: CouponPatch): Promise<CouponRecord> {
      const row = await tenantClient(base, tenantId).coupon.update({
        where: { id: couponId },
        data: {
          ...(patch.description === undefined ? {} : { description: patch.description }),
          ...(patch.mode === undefined ? {} : { mode: patch.mode }),
          ...(patch.value === undefined ? {} : { value: BigInt(patch.value) }),
          ...(patch.active === undefined ? {} : { active: patch.active }),
          ...(patch.validFrom === undefined ? {} : { validFrom: toDate(patch.validFrom) }),
          ...(patch.validUntil === undefined ? {} : { validUntil: toDate(patch.validUntil) }),
          ...(patch.maxUses === undefined ? {} : { maxUses: patch.maxUses }),
          ...(patch.maxUsesPerCustomer === undefined
            ? {}
            : { maxUsesPerCustomer: patch.maxUsesPerCustomer }),
          ...(patch.itineraryId === undefined ? {} : { itineraryId: patch.itineraryId }),
          ...(patch.groupId === undefined ? {} : { groupId: patch.groupId }),
          ...(patch.customerId === undefined ? {} : { customerId: patch.customerId }),
        },
      });
      return toCouponRecord(row);
    },

    async softDelete(tenantId: string, couponId: string): Promise<void> {
      await tenantClient(base, tenantId).coupon.update({
        where: { id: couponId },
        data: { deletedAt: new Date() },
      });
    },

    async findById(tenantId: string, couponId: string): Promise<CouponRecord | null> {
      const row = await tenantClient(base, tenantId).coupon.findFirst({
        where: { id: couponId, deletedAt: null },
      });
      return row ? toCouponRecord(row) : null;
    },

    async findByCode(tenantId: string, code: string): Promise<CouponRecord | null> {
      const row = await tenantClient(base, tenantId).coupon.findFirst({
        where: { code, deletedAt: null },
      });
      return row ? toCouponRecord(row) : null;
    },

    async list(tenantId: string): Promise<CouponRecord[]> {
      const rows = await tenantClient(base, tenantId).coupon.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toCouponRecord);
    },

    async countUses(tenantId: string, couponId: string, customerId: string): Promise<CouponUses> {
      const client = tenantClient(base, tenantId);
      const [total, byCustomer] = await Promise.all([
        client.couponRedemption.count({ where: { couponId, releasedAt: null } }),
        client.couponRedemption.count({ where: { couponId, customerId, releasedAt: null } }),
      ]);
      return { total, byCustomer };
    },

    async countActiveByCoupon(tenantId: string): Promise<Record<string, number>> {
      const grouped = await tenantClient(base, tenantId).couponRedemption.groupBy({
        by: ['couponId'],
        where: { releasedAt: null },
        _count: { _all: true },
      });
      const counts: Record<string, number> = {};
      for (const row of grouped) counts[row.couponId] = row._count._all;
      return counts;
    },

    async findActiveByBooking(
      tenantId: string,
      bookingId: string,
    ): Promise<RedemptionRecord | null> {
      const row = await tenantClient(base, tenantId).couponRedemption.findFirst({
        where: { bookingId, releasedAt: null },
      });
      return row ? toRedemptionRecord(row) : null;
    },

    async redeem(redemption: NewRedemption): Promise<RedemptionRecord> {
      const row = await tenantClient(base, redemption.tenantId).couponRedemption.create({
        data: {
          tenantId: redemption.tenantId,
          couponId: redemption.couponId,
          bookingId: redemption.bookingId,
          customerId: redemption.customerId,
          code: redemption.code,
          mode: redemption.mode,
          value: BigInt(redemption.value),
          discountCents: BigInt(redemption.discountCents),
          redeemedBy: redemption.redeemedBy,
        },
      });
      return toRedemptionRecord(row);
    },

    async release(
      tenantId: string,
      bookingId: string,
      releasedBy: string | null,
      releasedAt: Date,
    ): Promise<void> {
      await tenantClient(base, tenantId).couponRedemption.updateMany({
        where: { bookingId, releasedAt: null },
        data: { releasedAt, releasedBy },
      });
    },
  };
}

function toCouponRecord(row: PrismaCoupon): CouponRecord {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    mode: row.mode as CouponMode,
    value: Number(row.value),
    active: row.active,
    validFrom: toLocalDate(row.validFrom),
    validUntil: toLocalDate(row.validUntil),
    maxUses: row.maxUses,
    maxUsesPerCustomer: row.maxUsesPerCustomer,
    itineraryId: row.itineraryId,
    groupId: row.groupId,
    customerId: row.customerId,
    createdAt: row.createdAt,
  };
}

function toRedemptionRecord(row: PrismaRedemption): RedemptionRecord {
  return {
    id: row.id,
    couponId: row.couponId,
    bookingId: row.bookingId,
    customerId: row.customerId,
    code: row.code,
    mode: row.mode as CouponMode,
    value: Number(row.value),
    discountCents: cents(Number(row.discountCents)),
    redeemedAt: row.redeemedAt,
    releasedAt: row.releasedAt,
  };
}

function toDate(date: LocalDate | null): Date | null {
  return date === null ? null : new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function toLocalDate(date: Date | null): LocalDate | null {
  return date === null
    ? null
    : { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
