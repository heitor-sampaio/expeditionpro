import { compareLocalDate, type LocalDate } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';

/**
 * §5.8 — as saídas **abertas e públicas** para o cliente ver no portal (agenda) e se
 * inscrever. Só grupo `open`/`public` (a vitrine), com o roteiro resolvido, as datas e a
 * ocupação (vagas restantes). Ordenado por data de início. Leitura sem dado sensível.
 */

export interface OpenExpedition {
  readonly groupId: string;
  readonly itineraryId: string;
  readonly itineraryName: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly confirmedCount: number;
  readonly vacancies: number | null;
}

export interface ListOpenExpeditionsDeps {
  readonly schedule: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly itineraries: ItineraryRepository;
}

export async function listOpenExpeditions(
  deps: ListOpenExpeditionsDeps,
  ctx: RequestContext,
): Promise<OpenExpedition[]> {
  const events = await deps.schedule.listEvents(ctx.tenantId);
  const counts = new Map(
    (await deps.bookings.countByGroup(ctx.tenantId)).map((c) => [c.groupId, c.confirmedCount]),
  );
  const open = events.filter((e) => e.group.status === 'open' && e.group.visibility === 'public');

  const names = new Map<string, string>();
  const result: OpenExpedition[] = [];
  for (const { event, group } of open) {
    if (!names.has(group.itineraryId)) {
      const itinerary = await deps.itineraries.findById(ctx.tenantId, group.itineraryId);
      names.set(group.itineraryId, itinerary?.name ?? '—');
    }
    const confirmed = counts.get(group.id) ?? 0;
    result.push({
      groupId: group.id,
      itineraryId: group.itineraryId,
      itineraryName: names.get(group.itineraryId)!,
      startDate: event.startDate,
      endDate: event.endDate,
      confirmedCount: confirmed,
      vacancies:
        group.capacityVehicles === null ? null : Math.max(0, group.capacityVehicles - confirmed),
    });
  }
  return result.sort((a, b) => compareLocalDate(a.startDate, b.startDate));
}
