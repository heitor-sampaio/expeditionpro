import { requireWriter } from '../audience.js';
import {
  addDays,
  addMonths,
  calculateCashback,
  resolveCashbackRule,
  sumCents,
} from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { bookingContracted } from '../bookings/bookingTotals.js';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { PaymentRepository } from '../payments/paymentRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { CashbackRepository } from './cashbackRepository.js';

/**
 * CB-03/CB-04 — libera o cashback de uma inscrição confirmada, lançado ao **responsável**.
 * Resolve a regra vigente (config da empresa + override do grupo), calcula o crédito sobre
 * a base (pago ou contratado) e grava uma entrada `accrual` com `available_from` = término
 * + `release_days`. Cancelada não gera crédito; idempotente por inscrição.
 */

export interface AccrueCashbackDeps {
  readonly bookings: BookingRepository;
  readonly payments: PaymentRepository;
  readonly schedule: ScheduleRepository;
  readonly cashback: CashbackRepository;
}

export interface AccrueCashbackCommand {
  readonly bookingId: string;
}

export interface AccruedCashback {
  readonly credited: boolean;
  readonly entryId: string | null;
  readonly amountCents: number;
}

export async function accrueCashback(
  deps: AccrueCashbackDeps,
  ctx: RequestContext,
  command: AccrueCashbackCommand,
): Promise<AccruedCashback> {
  requireWriter(ctx);

  const actor = ctx.actor;

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }
  if (booking.status !== 'confirmed') {
    throw new BusinessRuleError('booking_not_confirmed', 'Só inscrição confirmada libera cashback');
  }
  if (await deps.cashback.hasAccrual(ctx.tenantId, command.bookingId)) {
    throw new BusinessRuleError('already_accrued', 'Cashback desta inscrição já foi liberado');
  }

  // CB-09: usa a regra **congelada na inscrição** (o que o cliente viu). Só resolve ao
  // vivo em inscrição antiga, sem snapshot (retrocompatível).
  const rule = booking.cashbackRuleSnapshot
    ? booking.cashbackRuleSnapshot.rule
    : resolveCashbackRule(
        await deps.cashback.getConfig(ctx.tenantId),
        await deps.cashback.getGroupOverride(ctx.tenantId, booking.groupId),
      );
  if (rule === null) {
    return { credited: false, entryId: null, amountCents: 0 };
  }

  const base =
    rule.base === 'paid'
      ? sumCents(
          (await deps.payments.listByBooking(ctx.tenantId, booking.id)).map((p) => p.amountCents),
        )
      : // CP-09: a base `contracted` é o valor com desconto — não se paga cashback
        // sobre dinheiro que o cupom tirou da venda.
        bookingContracted(booking);
  const credit = calculateCashback(base, rule);
  if (credit <= 0) {
    return { credited: false, entryId: null, amountCents: 0 };
  }

  const group = await deps.schedule.findGroupById(ctx.tenantId, booking.groupId);
  if (!group) {
    throw new NotFoundError('grupo');
  }
  const availableFrom = addDays(group.event.endDate, rule.releaseDays);
  const expiresAt = rule.validityMonths > 0 ? addMonths(availableFrom, rule.validityMonths) : null;

  const entry = await deps.cashback.addEntry({
    tenantId: ctx.tenantId,
    customerId: booking.responsibleCustomerId,
    bookingId: booking.id,
    type: 'accrual',
    amountCents: credit,
    availableFrom,
    expiresAt,
    notes: null,
    createdBy: actor.userId,
  });

  return { credited: true, entryId: entry.id, amountCents: credit };
}
