import {
  calculateCouponDiscount,
  checkCoupon,
  contractedTotal,
  normalizeCouponCode,
  sumCents,
  type Cents,
  type CouponRejection,
} from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import { toLocalDate } from '../support/toLocalDate.js';
import { bookingSubtotal } from '../bookings/bookingTotals.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { PaymentRepository } from '../payments/paymentRepository.js';
import type { CouponRecord, CouponRepository } from './couponRepository.js';

/**
 * CP-05..CP-07 — aplica um cupom a uma inscrição.
 *
 * O desconto vira **resgate**, nunca preço novo: os unitários congelados na alocação
 * (§3.4) não são tocados, e o contratado passa a ser a soma deles menos o abatimento.
 * A regra usada fica congelada no resgate (CP-10), então editar o cupom amanhã não
 * muda o que esta inscrição valeu.
 *
 * Exige owner ou admin (CP-06): desconto é decisão comercial, do mesmo peso da
 * confirmação manual de inscrição (IN-10).
 */

export interface ApplyCouponToBookingDeps {
  readonly coupons: CouponRepository;
  readonly bookings: BookingRepository;
  readonly schedule: ScheduleRepository;
  readonly payments: PaymentRepository;
  readonly audit: AuditLogRepository;
  readonly clock: () => Date;
}

export interface ApplyCouponToBookingCommand {
  readonly bookingId: string;
  readonly code: string;
}

export interface AppliedCoupon {
  readonly couponId: string;
  readonly code: string;
  readonly discountCents: Cents;
  readonly contractedCents: Cents;
}

export async function applyCouponToBooking(
  deps: ApplyCouponToBookingDeps,
  ctx: RequestContext,
  command: ApplyCouponToBookingCommand,
): Promise<AppliedCoupon> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Aplicar cupom exige owner ou admin');
  }

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) throw new NotFoundError('inscrição');
  if (booking.status === 'cancelled') {
    throw new BusinessRuleError('booking_cancelled', 'Inscrição cancelada não é reprecificada');
  }

  const applied = await deps.coupons.findActiveByBooking(ctx.tenantId, booking.id);
  if (applied) {
    throw new BusinessRuleError(
      'coupon_already_applied',
      'Esta inscrição já tem um cupom; remova o atual antes de aplicar outro',
    );
  }

  const coupon = await findCoupon(deps.coupons, ctx.tenantId, command.code);
  const group = await deps.schedule.findGroupById(ctx.tenantId, booking.groupId);
  if (!group) throw new NotFoundError('grupo');

  const uses = await deps.coupons.countUses(ctx.tenantId, coupon.id, booking.responsibleCustomerId);

  const check = checkCoupon(
    {
      code: coupon.code,
      mode: coupon.mode,
      value: coupon.value,
      active: coupon.active,
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      maxUses: coupon.maxUses,
      maxUsesPerCustomer: coupon.maxUsesPerCustomer,
      itineraryId: coupon.itineraryId,
      groupId: coupon.groupId,
      customerId: coupon.customerId,
    },
    {
      today: toLocalDate(deps.clock()),
      itineraryId: group.group.itineraryId,
      groupId: booking.groupId,
      responsibleCustomerId: booking.responsibleCustomerId,
      usesTotal: uses.total,
      usesByCustomer: uses.byCustomer,
    },
  );
  if (!check.ok) {
    throw new BusinessRuleError(check.reason, rejectionMessage(check.reason));
  }

  const subtotal = bookingSubtotal(booking);
  const discountCents = calculateCouponDiscount(subtotal, coupon);
  const contractedCents = contractedTotal(
    booking.participants.map((participant) => participant.unitPriceCents),
    discountCents,
  );

  // CP-07: o desconto não pode deixar a inscrição valendo menos do que já entrou —
  // seria uma devolução que ninguém decidiu. O caminho da devolução é §3.6.
  const received = await deps.payments.listByBooking(ctx.tenantId, booking.id);
  const receivedCents = sumCents(received.map((payment) => payment.amountCents));
  if (contractedCents < receivedCents) {
    throw new BusinessRuleError(
      'discount_below_received',
      'O desconto deixaria a inscrição abaixo do valor já recebido',
    );
  }

  await deps.coupons.redeem({
    tenantId: ctx.tenantId,
    couponId: coupon.id,
    bookingId: booking.id,
    customerId: booking.responsibleCustomerId,
    code: coupon.code,
    mode: coupon.mode,
    value: coupon.value,
    discountCents,
    redeemedBy: actorUserId(actor),
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'booking',
    entityId: booking.id,
    action: 'coupon.apply',
    diff: { code: coupon.code, discountCents: Number(discountCents) },
  });

  return { couponId: coupon.id, code: coupon.code, discountCents, contractedCents };
}

/**
 * Código malformado e código inexistente respondem a mesma coisa: quem digita não
 * precisa saber qual dos dois foi, e a diferença só serviria para sondar códigos.
 */
async function findCoupon(
  coupons: CouponRepository,
  tenantId: string,
  raw: string,
): Promise<CouponRecord> {
  let code: string;
  try {
    code = normalizeCouponCode(raw);
  } catch {
    throw new NotFoundError('cupom');
  }
  const coupon = await coupons.findByCode(tenantId, code);
  if (!coupon) throw new NotFoundError('cupom');
  return coupon;
}

function rejectionMessage(reason: CouponRejection): string {
  switch (reason) {
    case 'inactive':
      return 'Este cupom está desativado';
    case 'not_started':
      return 'Este cupom ainda não entrou em vigor';
    case 'expired':
      return 'Este cupom está vencido';
    case 'itinerary_not_allowed':
      return 'Este cupom não vale para o roteiro desta saída';
    case 'group_not_allowed':
      return 'Este cupom não vale para esta saída';
    case 'not_for_this_customer':
      return 'Este cupom foi emitido para outro cliente';
    case 'exhausted':
      return 'Este cupom atingiu o limite de usos';
    case 'customer_limit_reached':
      return 'Este cliente já usou este cupom o número de vezes permitido';
  }
}
