import type { LocalDate } from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import { bookingContracted } from './bookingTotals.js';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from './bookingRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';

/**
 * IN-17b — as últimas inscrições que entraram, de qualquer origem (portal, site, manual).
 * É a lista que a equipe olha depois de processar a fila: quem entrou, em qual saída, como
 * está e por onde chegou.
 *
 * Leitura derivada, sem tabela nova: o contratado é a SOMA dos unitários congelados, como
 * em toda leitura de dinheiro do sistema. Só equipe — o cliente tem a própria ficha (CL-06).
 */

export interface RecentBookingRow {
  readonly bookingId: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly responsibleCustomerId: string;
  readonly responsibleName: string;
  readonly status: string;
  readonly source: string;
  readonly participantCount: number;
  readonly contractedCents: number;
}

export interface ListRecentBookingsDeps {
  readonly bookings: BookingRepository;
  readonly schedule: ScheduleRepository;
  readonly customers: CustomerRepository;
}

export interface ListRecentBookingsCommand {
  readonly limit?: number | undefined;
}

const DEFAULT_LIMIT = 20;

export async function listRecentBookings(
  deps: ListRecentBookingsDeps,
  ctx: RequestContext,
  command: ListRecentBookingsCommand,
): Promise<RecentBookingRow[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A lista de inscrições é da equipe');
  }

  const recent = await deps.bookings.listRecent(ctx.tenantId, command.limit ?? DEFAULT_LIMIT);
  const rows: RecentBookingRow[] = [];

  for (const booking of recent) {
    const context = await deps.schedule.findGroupById(ctx.tenantId, booking.groupId);
    if (!context) continue; // saída excluída: a inscrição não tem onde ser mostrada
    const responsible = await deps.customers.findById(ctx.tenantId, booking.responsibleCustomerId);

    rows.push({
      bookingId: booking.id,
      groupId: booking.groupId,
      groupName: context.group.name,
      startDate: context.event.startDate,
      endDate: context.event.endDate,
      responsibleCustomerId: booking.responsibleCustomerId,
      responsibleName: responsible?.fullName ?? '—',
      status: booking.status,
      source: booking.source,
      participantCount: booking.participants.length,
      contractedCents: Number(bookingContracted(booking)),
    });
  }

  return rows;
}
