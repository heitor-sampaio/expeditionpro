import { cents } from '@expedition/domain';
import type {
  BookingRecord,
  CouponPatch,
  CouponRecord,
  CouponRepository,
  CouponUses,
  NewCoupon,
  NewRedemption,
  RedemptionRecord,
} from '@expedition/application';

/**
 * Cupons em memória — SÓ para dev sem banco e testes de rota (§5.15).
 *
 * Recebe as linhas de inscrição do `inMemoryBookings` para espelhar o que a consulta
 * real faz: o desconto viaja junto da inscrição, não numa segunda leitura.
 */
export function inMemoryCoupons(bookingRows?: BookingRecord[]): CouponRepository {
  const rows: (CouponRecord & { tenantId: string; deleted: boolean })[] = [];
  const redemptions: (RedemptionRecord & { tenantId: string })[] = [];
  let seq = 0;

  const live = (tenantId: string) => rows.filter((r) => r.tenantId === tenantId && !r.deleted);

  function syncBooking(bookingId: string): void {
    if (!bookingRows) return;
    const index = bookingRows.findIndex((b) => b.id === bookingId);
    if (index < 0) return;
    const active = redemptions.find((r) => r.bookingId === bookingId && r.releasedAt === null);
    bookingRows[index] = {
      ...bookingRows[index]!,
      discount: active
        ? { couponId: active.couponId, code: active.code, discountCents: active.discountCents }
        : null,
    };
  }

  return {
    create(coupon: NewCoupon) {
      seq += 1;
      const record = { ...coupon, id: `coupon-${seq}`, createdAt: new Date(), deleted: false };
      rows.push(record);
      return Promise.resolve(record);
    },
    update(tenantId: string, couponId: string, patch: CouponPatch) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === couponId);
      if (index < 0) return Promise.reject(new Error('cupom nao encontrado'));
      const updated = { ...rows[index]!, ...patch };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    softDelete(tenantId: string, couponId: string) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === couponId);
      if (index >= 0) rows[index] = { ...rows[index]!, deleted: true };
      return Promise.resolve();
    },
    findById(tenantId: string, couponId: string) {
      return Promise.resolve(live(tenantId).find((r) => r.id === couponId) ?? null);
    },
    findByCode(tenantId: string, code: string) {
      return Promise.resolve(live(tenantId).find((r) => r.code === code) ?? null);
    },
    list(tenantId: string) {
      return Promise.resolve([...live(tenantId)]);
    },
    countUses(tenantId: string, couponId: string, customerId: string): Promise<CouponUses> {
      const active = redemptions.filter(
        (r) => r.tenantId === tenantId && r.couponId === couponId && r.releasedAt === null,
      );
      return Promise.resolve({
        total: active.length,
        byCustomer: active.filter((r) => r.customerId === customerId).length,
      });
    },
    countActiveByCoupon(tenantId: string) {
      const counts: Record<string, number> = {};
      for (const r of redemptions) {
        if (r.tenantId !== tenantId || r.releasedAt !== null) continue;
        counts[r.couponId] = (counts[r.couponId] ?? 0) + 1;
      }
      return Promise.resolve(counts);
    },
    findActiveByBooking(tenantId: string, bookingId: string) {
      return Promise.resolve(
        redemptions.find(
          (r) => r.tenantId === tenantId && r.bookingId === bookingId && r.releasedAt === null,
        ) ?? null,
      );
    },
    redeem(redemption: NewRedemption) {
      seq += 1;
      const record = {
        ...redemption,
        id: `redemption-${seq}`,
        discountCents: cents(redemption.discountCents),
        redeemedAt: new Date(),
        releasedAt: null,
      };
      redemptions.push(record);
      syncBooking(redemption.bookingId);
      return Promise.resolve(record);
    },
    release(tenantId: string, bookingId: string, releasedBy: string | null, releasedAt: Date) {
      void releasedBy;
      const index = redemptions.findIndex(
        (r) => r.tenantId === tenantId && r.bookingId === bookingId && r.releasedAt === null,
      );
      if (index >= 0) {
        redemptions[index] = { ...redemptions[index]!, releasedAt };
        syncBooking(bookingId);
      }
      return Promise.resolve();
    },
  };
}
