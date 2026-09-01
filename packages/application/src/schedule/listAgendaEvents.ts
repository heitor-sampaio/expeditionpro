import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { GroupRecord, ScheduleEventRecord, ScheduleRepository } from './scheduleRepository.js';

/**
 * AG-01/AG-06 — os eventos da agenda com a **ocupação** de cada grupo: confirmadas,
 * pendentes e vagas. Só inscrição confirmada ocupa vaga (a pendente aparece à parte,
 * §5.5). Sem limite de veículos (`capacityVehicles` null), não há vagas a mostrar —
 * só a contagem (AG-06). A contagem vem numa consulta agregada por grupo, não N+1.
 */

export interface AgendaEventOccupancy {
  readonly capacityVehicles: number | null;
  readonly confirmedCount: number;
  readonly pendingCount: number;
  readonly vacancies: number | null;
}

export interface AgendaEvent {
  readonly event: ScheduleEventRecord;
  readonly group: GroupRecord;
  readonly occupancy: AgendaEventOccupancy;
}

export interface ListAgendaEventsDeps {
  readonly schedule: ScheduleRepository;
  readonly bookings: BookingRepository;
}

export async function listAgendaEvents(
  deps: ListAgendaEventsDeps,
  ctx: RequestContext,
): Promise<AgendaEvent[]> {
  const events = await deps.schedule.listEvents(ctx.tenantId);
  const counts = new Map(
    (await deps.bookings.countByGroup(ctx.tenantId)).map((c) => [c.groupId, c]),
  );

  return events.map(({ event, group }) => {
    const count = counts.get(group.id);
    const confirmedCount = count?.confirmedCount ?? 0;
    const pendingCount = count?.pendingCount ?? 0;
    const capacity = group.capacityVehicles;
    return {
      event,
      group,
      occupancy: {
        capacityVehicles: capacity,
        confirmedCount,
        pendingCount,
        vacancies: capacity === null ? null : Math.max(0, capacity - confirmedCount),
      },
    };
  });
}
