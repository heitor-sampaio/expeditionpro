import { requireWriter } from '../audience.js';
import { BusinessRuleError, NotFoundError, RequiredFieldError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { CouponRepository } from '../coupons/couponRepository.js';
import type { BookingRecord, BookingRepository } from './bookingRepository.js';

/**
 * IN-15/IN-16 — cancela a inscrição, com motivo obrigatório. É feito **apenas pela
 * equipe** (o cliente não cancela pelo portal — a solicitação chega por contato direto).
 * O cancelamento NÃO apaga recebimentos: o valor fica no ledger e o tratamento
 * (devolução, crédito, retenção) é decidido caso a caso, fora daqui.
 */

export interface CancelBookingDeps {
  readonly bookings: BookingRepository;
  readonly audit: AuditLogRepository;
  readonly coupons: CouponRepository;
  readonly clock: () => Date;
}

export interface CancelBookingCommand {
  readonly bookingId: string;
  readonly reason: string;
}

export async function cancelBooking(
  deps: CancelBookingDeps,
  ctx: RequestContext,
  command: CancelBookingCommand,
): Promise<BookingRecord> {
  requireWriter(ctx);

  const actor = ctx.actor;
  const reason = command.reason.trim();
  if (reason.length === 0) {
    throw new RequiredFieldError('motivo');
  }

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }
  if (booking.status === 'cancelled') {
    throw new BusinessRuleError('already_cancelled', 'Inscrição já está cancelada');
  }

  // CP-08: saída cancelada não consome cupom — o uso volta para a campanha. Liberar
  // antes de cancelar mantém o resgate coerente mesmo se o cancelamento falhar.
  await deps.coupons.release(ctx.tenantId, booking.id, actorUserId(actor), deps.clock());

  const cancelled = await deps.bookings.cancel(ctx.tenantId, command.bookingId, {
    cancelledBy: actor.userId,
    cancelledAt: deps.clock(),
    reason,
  });

  /*
   * A09 — a trilha estava **pela metade**: este arquivo já importava `actorUserId` e nunca
   * chamava `audit.record`. Trilha começada e não terminada é pior que ausente, porque o
   * import faz parecer que existe. O motivo é justamente o que se pergunta depois.
   */
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'booking',
    entityId: command.bookingId,
    action: 'booking.cancel',
    diff: { reason, previousStatus: booking.status },
  });

  return cancelled;
}
