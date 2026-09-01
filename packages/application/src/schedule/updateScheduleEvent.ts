import { compareLocalDate, parseLocalDate } from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { deriveGroupName } from './deriveGroupName.js';
import type { RequestContext } from '../context.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';
import type { ScheduleEventWithGroup, ScheduleRepository } from './scheduleRepository.js';

/**
 * AG-04 — edita o evento (datas, título, notas) e propaga ao grupo. O nome do grupo
 * é re-derivado (título explícito ou roteiro + data), então o nome automático segue a
 * mudança de data. Só campos informados mudam; os demais mantêm o valor atual.
 *
 * As inscrições já existentes NÃO são reprecificadas: o snapshot é congelado (§3.4).
 * Mudar a data afeta só a base de futuras alocações.
 */

export interface UpdateScheduleEventDeps {
  readonly schedule: ScheduleRepository;
  readonly itineraries: ItineraryRepository;
}

export interface UpdateScheduleEventCommand {
  readonly eventId: string;
  readonly startDate?: string | undefined;
  readonly endDate?: string | undefined;
  readonly title?: string | null | undefined;
  readonly notes?: string | null | undefined;
}

export async function updateScheduleEvent(
  deps: UpdateScheduleEventDeps,
  ctx: RequestContext,
  command: UpdateScheduleEventCommand,
): Promise<ScheduleEventWithGroup> {
  const current = await deps.schedule.findEventById(ctx.tenantId, command.eventId);
  if (!current) {
    throw new NotFoundError('evento');
  }

  const startDate = command.startDate ? parseLocalDate(command.startDate) : current.event.startDate;
  const endDate = command.endDate ? parseLocalDate(command.endDate) : current.event.endDate;
  if (compareLocalDate(endDate, startDate) < 0) {
    throw new BusinessRuleError(
      'invalid_date_range',
      'A data de término não pode ser anterior à de início',
    );
  }

  const title = resolve(command.title, current.event.title);
  const notes = resolve(command.notes, current.event.notes);

  const itinerary = await deps.itineraries.findById(ctx.tenantId, current.event.itineraryId);
  if (!itinerary) {
    throw new NotFoundError('roteiro');
  }

  return deps.schedule.updateEvent(
    ctx.tenantId,
    command.eventId,
    { startDate, endDate, title, notes },
    deriveGroupName(itinerary.name, startDate, title),
  );
}

/** Campo omitido mantém o atual; `null` ou string em branco limpa; string preenchida troca. */
function resolve(incoming: string | null | undefined, current: string | null): string | null {
  if (incoming === undefined) return current;
  const trimmed = incoming?.trim();
  return trimmed ? trimmed : null;
}
