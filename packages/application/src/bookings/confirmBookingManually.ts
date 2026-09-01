import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord, BookingRepository } from './bookingRepository.js';

/**
 * IN-10 — confirmação manual sem pagamento (cortesia, permuta, acerto fora do sistema),
 * com motivo obrigatório gravado em `confirmed_note`. É confirmação, então vale a regra
 * de IN-09: só `owner`/`admin`. Só age em inscrição `pending`.
 */

export interface ConfirmBookingManuallyDeps {
  readonly bookings: BookingRepository;
  readonly clock: () => Date;
}

export interface ConfirmBookingManuallyCommand {
  readonly bookingId: string;
  readonly note: string;
}

export async function confirmBookingManually(
  deps: ConfirmBookingManuallyDeps,
  ctx: RequestContext,
  command: ConfirmBookingManuallyCommand,
): Promise<BookingRecord> {
  const actor = ctx.actor;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Confirmar inscrição exige owner ou admin');
  }
  const note = command.note.trim();
  if (note.length === 0) {
    throw new RequiredFieldError('motivo');
  }

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }
  if (booking.status !== 'pending') {
    throw new BusinessRuleError('not_pending', 'Só uma inscrição pendente pode ser confirmada');
  }

  return deps.bookings.confirmManually(ctx.tenantId, command.bookingId, {
    confirmedBy: actor.userId,
    confirmedAt: deps.clock(),
    note,
  });
}
