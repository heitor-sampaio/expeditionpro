import { applyPercent, cents, resolveCashbackRule, sumCents } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { CashbackRepository } from './cashbackRepository.js';

/**
 * CB-05/CB-06 — resgate como lançamento **negativo** na inscrição, nunca alterando o valor
 * congelado do participante. Limitado pelo saldo do responsável e pelo teto por inscrição
 * (`max_redemption_pct` sobre o contratado). Só owner/admin (movimento de dinheiro).
 */

export interface RedeemCashbackDeps {
  readonly bookings: BookingRepository;
  readonly cashback: CashbackRepository;
}

export interface RedeemCashbackCommand {
  readonly bookingId: string;
  readonly amountCents: number;
}

export interface RedeemedCashback {
  readonly entryId: string;
  readonly amountCents: number; // negativo (lançamento)
  readonly newBalanceCents: number;
}

export async function redeemCashback(
  deps: RedeemCashbackDeps,
  ctx: RequestContext,
  command: RedeemCashbackCommand,
): Promise<RedeemedCashback> {
  const actor = ctx.actor;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Resgatar cashback exige owner ou admin');
  }
  if (!Number.isInteger(command.amountCents) || command.amountCents <= 0) {
    throw new BusinessRuleError('invalid_amount', 'Valor do resgate deve ser positivo');
  }

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }

  const balance = await deps.cashback.balance(ctx.tenantId, booking.responsibleCustomerId);
  if (command.amountCents > balance) {
    throw new BusinessRuleError('insufficient_balance', 'Saldo de cashback insuficiente');
  }

  const config = await deps.cashback.getConfig(ctx.tenantId);
  const override = await deps.cashback.getGroupOverride(ctx.tenantId, booking.groupId);
  const rule = resolveCashbackRule(config, override);
  const maxPct = rule?.maxRedemptionPct ?? config.maxRedemptionPct;
  if (maxPct > 0) {
    const contracted = sumCents(booking.participants.map((p) => p.unitPriceCents));
    const cap = applyPercent(contracted, maxPct);
    if (command.amountCents > cap) {
      throw new BusinessRuleError('exceeds_max_redemption', 'Resgate acima do teto por inscrição');
    }
  }

  const entry = await deps.cashback.addEntry({
    tenantId: ctx.tenantId,
    customerId: booking.responsibleCustomerId,
    bookingId: booking.id,
    type: 'redemption',
    amountCents: cents(-command.amountCents),
    availableFrom: null,
    expiresAt: null,
    notes: null,
    createdBy: actor.userId,
  });

  return {
    entryId: entry.id,
    amountCents: -command.amountCents,
    newBalanceCents: balance - command.amountCents,
  };
}
