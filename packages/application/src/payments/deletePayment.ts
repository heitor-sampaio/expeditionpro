import { actorUserId } from '../audit/auditLogRepository.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { PaymentRepository } from './paymentRepository.js';

/**
 * IN-11 — exclui (logicamente) um recebimento. Excluir o único pagamento de uma
 * inscrição confirmada **não** reverte o status automaticamente: o sistema sinaliza
 * (`requiresDecision`) e a equipe decide explicitamente. Dinheiro não some do ledger
 * (soft delete). Excluir recebimento é ato financeiro: só `owner`/`admin` (IN-09).
 */

export interface DeletePaymentDeps {
  readonly payments: PaymentRepository;
  readonly audit: AuditLogRepository;
  readonly bookings: BookingRepository;
}

export interface DeletePaymentCommand {
  readonly paymentId: string;
}

export interface DeletedPayment {
  readonly bookingId: string;
  readonly bookingStatus: string;
  readonly remainingPayments: number;
  readonly requiresDecision: boolean;
}

export async function deletePayment(
  deps: DeletePaymentDeps,
  ctx: RequestContext,
  command: DeletePaymentCommand,
): Promise<DeletedPayment> {
  const actor = ctx.actor;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Excluir recebimento exige owner ou admin');
  }

  const payment = await deps.payments.findById(ctx.tenantId, command.paymentId);
  if (!payment) {
    throw new NotFoundError('recebimento');
  }

  await deps.payments.softDelete(ctx.tenantId, command.paymentId);

  /*
   * A09 — a operação com maior potencial de fraude interna do sistema: apaga dinheiro
   * recebido, exige owner/admin, e até agora não deixava vestígio de quem apagou nem de
   * quanto era. O valor no `diff` é o que permite reconstruir o saldo depois.
   */
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'booking_payment',
    entityId: payment.id,
    action: 'booking_payment.delete',
    diff: {
      bookingId: payment.bookingId,
      amountCents: Number(payment.amountCents),
      method: payment.method,
    },
  });

  const remainingPayments = await deps.payments.countActiveByBooking(
    ctx.tenantId,
    payment.bookingId,
  );
  const booking = await deps.bookings.findById(ctx.tenantId, payment.bookingId);
  const bookingStatus = booking?.status ?? 'unknown';

  return {
    bookingId: payment.bookingId,
    bookingStatus,
    remainingPayments,
    requiresDecision: bookingStatus === 'confirmed' && remainingPayments === 0,
  };
}
