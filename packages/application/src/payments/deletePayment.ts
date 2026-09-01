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
