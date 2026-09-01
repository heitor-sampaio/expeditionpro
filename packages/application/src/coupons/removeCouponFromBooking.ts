import type { Cents } from '@expedition/domain';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import { bookingSubtotal } from '../bookings/bookingTotals.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { CouponRepository } from './couponRepository.js';

/**
 * CP-08 — tira o cupom da inscrição e devolve o uso ao cupom.
 *
 * O resgate não é apagado: ganha `released_at`, e some da contagem de usos. Assim a
 * campanha continua respondendo "quem usou o quê" mesmo depois do desconto desfeito —
 * histórico é imutável (§3.6), inclusive o de desconto.
 */

export interface RemoveCouponFromBookingDeps {
  readonly coupons: CouponRepository;
  readonly bookings: BookingRepository;
  readonly audit: AuditLogRepository;
  readonly clock: () => Date;
}

export interface RemoveCouponFromBookingCommand {
  readonly bookingId: string;
}

export interface RemovedCoupon {
  readonly code: string;
  readonly contractedCents: Cents;
}

export async function removeCouponFromBooking(
  deps: RemoveCouponFromBookingDeps,
  ctx: RequestContext,
  command: RemoveCouponFromBookingCommand,
): Promise<RemovedCoupon> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Remover cupom exige owner ou admin');
  }

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) throw new NotFoundError('inscrição');

  const redemption = await deps.coupons.findActiveByBooking(ctx.tenantId, booking.id);
  if (!redemption) throw new NotFoundError('cupom da inscrição');

  await deps.coupons.release(ctx.tenantId, booking.id, actorUserId(actor), deps.clock());

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'booking',
    entityId: booking.id,
    action: 'coupon.remove',
    diff: { code: redemption.code, discountCents: Number(redemption.discountCents) },
  });

  return { code: redemption.code, contractedCents: bookingSubtotal(booking) };
}
