import { requireWriter } from '../audience.js';
import { compareLocalDate, parseLocalDate } from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { deriveGroupName } from './deriveGroupName.js';
import type { RequestContext } from '../context.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';
import type { ScheduleEventWithGroup, ScheduleRepository } from './scheduleRepository.js';

/**
 * AG-02/AG-03 — cria um evento de agenda (roteiro + datas) e, na mesma transação,
 * o grupo onde as inscrições vão viver. Sem grupo não há data de início, e sem data
 * não há faixa etária nem preço (§3.4); por isso os dois nascem juntos.
 *
 * O grupo herda do roteiro e dos padrões da empresa: `pricing_mode` itinerary,
 * `visibility` public, sem limite de vagas (AG-08/AG-07 mudam isso por comando). Nasce
 * **aberto** (`open`) — já entra na vitrine pública e aceita a auto-inscrição do cliente.
 */

export interface ScheduleDeps {
  readonly schedule: ScheduleRepository;
  readonly itineraries: ItineraryRepository;
}

export interface CreateScheduleEventCommand {
  readonly itineraryId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly title?: string | undefined;
  readonly notes?: string | undefined;
  readonly capacityVehicles?: number | undefined;
  readonly visibility?: 'public' | 'private' | undefined;
  readonly pricingMode?: 'itinerary' | 'manual' | undefined;
}

export async function createScheduleEvent(
  deps: ScheduleDeps,
  ctx: RequestContext,
  command: CreateScheduleEventCommand,
): Promise<ScheduleEventWithGroup> {
  requireWriter(ctx);
  const itinerary = await deps.itineraries.findById(ctx.tenantId, command.itineraryId);
  if (!itinerary) {
    throw new NotFoundError('roteiro');
  }

  const startDate = parseLocalDate(command.startDate);
  const endDate = parseLocalDate(command.endDate);
  if (compareLocalDate(endDate, startDate) < 0) {
    throw new BusinessRuleError(
      'invalid_date_range',
      'A data de término não pode ser anterior à de início',
    );
  }

  return deps.schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: itinerary.id,
      startDate,
      endDate,
      title: blankToNull(command.title),
      notes: blankToNull(command.notes),
      status: 'scheduled',
    },
    {
      name: deriveGroupName(itinerary.name, startDate, blankToNull(command.title)),
      status: 'open',
      capacityVehicles: command.capacityVehicles ?? null,
      visibility: command.visibility ?? 'public',
      pricingMode: command.pricingMode ?? 'itinerary',
    },
  );
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
