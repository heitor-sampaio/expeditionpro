import { cents } from '@expedition/domain';
import type { BookingRecord } from '../bookings/bookingRepository.js';
import type {
  CouponPatch,
  CouponRecord,
  CouponRepository,
  CouponUses,
  NewCoupon,
  NewRedemption,
  RedemptionRecord,
} from './couponRepository.js';

/**
 * Fake in-memory do port de cupons. Excluído do build (`*.fake.ts`).
 *
 * Aceita as linhas do fake de inscrições para espelhar o que a transação real faz:
 * resgatar e liberar mudam o desconto que o repositório de inscrições devolve junto
 * do registro. Sem isso, o teste de um caso de uso leitor não veria o desconto.
 */
export function fakeCouponRepository(bookingRows?: BookingRecord[]): CouponRepository & {
  rows: (CouponRecord & { tenantId: string; deleted: boolean })[];
  redemptions: (RedemptionRecord & { tenantId: string })[];
} {
  const rows: (CouponRecord & { tenantId: string; deleted: boolean })[] = [];
  const redemptions: (RedemptionRecord & { tenantId: string })[] = [];
  let seq = 0;

  const live = (tenantId: string) => rows.filter((r) => r.tenantId === tenantId && !r.deleted);
  const activeOf = (tenantId: string, bookingId: string) =>
    redemptions.find(
      (r) => r.tenantId === tenantId && r.bookingId === bookingId && r.releasedAt === null,
    ) ?? null;

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
    rows,
    redemptions,
    create(coupon: NewCoupon) {
      seq += 1;
      const record = { ...coupon, id: `coupon-${seq}`, createdAt: new Date(0), deleted: false };
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
      return Promise.resolve(activeOf(tenantId, bookingId));
    },
    redeem(redemption: NewRedemption) {
      seq += 1;
      const record = {
        ...redemption,
        id: `redemption-${seq}`,
        discountCents: cents(redemption.discountCents),
        redeemedAt: new Date(0),
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
