import { requireWriter } from '../audience.js';
import { cents } from '@expedition/domain';
import { toLocalDate } from '../support/toLocalDate.js';
import type { RequestContext } from '../context.js';
import type { CashbackRepository } from './cashbackRepository.js';

/**
 * CB-07 — expira o cashback vencido. Para cada crédito cujo `expires_at` já chegou e que
 * ainda tem saldo remanescente na inscrição (accrual menos resgates), lança uma entrada
 * `expiry` negativa desse remanescente. Idempotente: rodado de novo, o remanescente já é
 * zero e nada é lançado. É um job da equipe (roda periódico); o saldo continua derivado do
 * ledger, nunca corrigido à mão.
 */

export interface ExpireCashbackDeps {
  readonly cashback: CashbackRepository;
  readonly clock?: (() => Date) | undefined;
}

export interface ExpiredCashback {
  readonly expiredCount: number;
  readonly totalExpiredCents: number;
}

export async function expireCashback(
  deps: ExpireCashbackDeps,
  ctx: RequestContext,
): Promise<ExpiredCashback> {
  requireWriter(ctx);

  const today = toLocalDate((deps.clock ?? (() => new Date()))());
  const expired = await deps.cashback.listExpiredCredits(ctx.tenantId, today);

  let totalExpiredCents = 0;
  for (const credit of expired) {
    await deps.cashback.addEntry({
      tenantId: ctx.tenantId,
      customerId: credit.customerId,
      bookingId: credit.bookingId,
      type: 'expiry',
      amountCents: cents(-credit.remainingCents),
      availableFrom: null,
      expiresAt: null,
      notes: 'expiração automática (CB-07)',
      createdBy: null,
    });
    totalExpiredCents += credit.remainingCents;
  }

  return { expiredCount: expired.length, totalExpiredCents };
}
