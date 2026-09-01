import { requireWriter } from '../audience.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { BookingRecord, BookingRepository } from './bookingRepository.js';

/**
 * GR-14 — desfazer o check-in é **da equipe** (decisão do dono do produto): o cliente
 * marca e não volta atrás, senão a lista de embarque muda sozinha na hora da saída.
 * Fica na trilha, como toda correção de fato registrado.
 */

export interface UndoCheckInDeps {
  readonly bookings: BookingRepository;
  readonly audit: AuditLogRepository;
}

export interface UndoCheckInCommand {
  readonly bookingId: string;
}

export async function undoCheckIn(
  deps: UndoCheckInDeps,
  ctx: RequestContext,
  command: UndoCheckInCommand,
): Promise<BookingRecord> {
  requireWriter(ctx);

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }
  if (booking.checkedInAt === null) {
    throw new BusinessRuleError('not_checked_in', 'Esta inscrição não tem check-in');
  }

  const updated = await deps.bookings.setCheckedIn(ctx.tenantId, booking.id, null, null);
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'booking',
    entityId: booking.id,
    action: 'booking.checkin_undo',
    diff: { was: booking.checkedInAt.toISOString() },
  });
  return updated;
}
