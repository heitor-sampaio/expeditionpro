import { checkInAvailability, type CheckInBlock } from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import { assertActorManagesCustomer } from '../portal/familyScope.js';
import { toLocalDate } from '../support/toLocalDate.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { BookingRecord, BookingRepository } from './bookingRepository.js';

/**
 * GR-14 — check-in da inscrição: quem embarcou. As duas pontas usam este caso de uso; o
 * que muda é a régua, e ela mora no domínio (`checkInAvailability`), não aqui. A equipe
 * faz check-in de inscrição pendente; o cliente, só da confirmada.
 *
 * O cliente só alcança a inscrição da própria família — a defesa é o mesmo `familyScope`
 * da escrita do portal, porque a RLS protege leitura, não escrita.
 */

export interface CheckInBookingDeps {
  readonly bookings: BookingRepository;
  readonly customers: CustomerRepository;
  readonly schedule: ScheduleRepository;
  readonly audit: AuditLogRepository;
  readonly clock: () => Date;
}

export interface CheckInBookingCommand {
  readonly bookingId: string;
}

export async function checkInBooking(
  deps: CheckInBookingDeps,
  ctx: RequestContext,
  command: CheckInBookingCommand,
): Promise<BookingRecord> {
  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }
  await assertActorManagesCustomer(deps.customers, ctx, booking.responsibleCustomerId);

  const context = await deps.schedule.findGroupById(ctx.tenantId, booking.groupId);
  if (!context) {
    throw new NotFoundError('grupo');
  }

  const now = deps.clock();
  const availability = checkInAvailability({
    status: booking.status,
    alreadyCheckedIn: booking.checkedInAt !== null,
    audience: ctx.actor.kind === 'team' ? 'team' : 'customer',
    startDate: context.event.startDate,
    endDate: context.event.endDate,
    today: toLocalDate(now),
  });
  if (!availability.allowed) {
    throw new BusinessRuleError(availability.reason, checkInBlockMessage(availability.reason));
  }

  const updated = await deps.bookings.setCheckedIn(
    ctx.tenantId,
    booking.id,
    now,
    actorUserId(ctx.actor),
  );
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'booking',
    entityId: booking.id,
    action: 'booking.checkin',
    diff: { by: ctx.actor.kind },
  });
  return updated;
}

/** Mensagem de negócio por bloqueio — o código é o contrato, o texto é para a tela. */
export function checkInBlockMessage(reason: CheckInBlock): string {
  if (reason === 'cancelled') return 'Inscrição cancelada não faz check-in';
  if (reason === 'already_checked_in') return 'Check-in já feito';
  if (reason === 'not_started') return 'O check-in abre no dia da saída';
  if (reason === 'already_over') return 'A saída já terminou';
  return 'O check-in exige a inscrição confirmada';
}
