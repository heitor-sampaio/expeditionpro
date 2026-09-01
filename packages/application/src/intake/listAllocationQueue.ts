import { compareLocalDate, type LocalDate } from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import { toLocalDate } from '../support/toLocalDate.js';
import type { RequestContext } from '../context.js';
import type { IntakeQueueItem, IntakeRepository } from './intakeRepository.js';
import type { ScheduleEventWithGroup, ScheduleRepository } from '../schedule/scheduleRepository.js';

/**
 * IN-17 + IN-20b — a fila de alocação para o admin. Cada item já vem com o roteiro
 * resolvido (IN-20) e, quando há, uma **sugestão** do próximo grupo aberto daquele
 * roteiro. A sugestão é só isso: a interface pré-seleciona, mas nada aloca sem a
 * confirmação do admin. É da equipe.
 */

export interface ListAllocationQueueDeps {
  readonly intake: IntakeRepository;
  readonly schedule: ScheduleRepository;
  readonly clock?: (() => Date) | undefined;
}

export interface AllocationQueueItem extends IntakeQueueItem {
  /** IN-20b: próximo grupo aberto do roteiro resolvido; null se não há roteiro ou grupo. */
  readonly suggestedGroupId: string | null;
  readonly suggestedGroupName: string | null;
}

export async function listAllocationQueue(
  deps: ListAllocationQueueDeps,
  ctx: RequestContext,
): Promise<AllocationQueueItem[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A fila de alocação é da equipe');
  }
  const items = await deps.intake.listQueue(ctx.tenantId);
  // Só busca a agenda se algum item tem roteiro a sugerir — evita a consulta à toa.
  const events = items.some((item) => item.itineraryId !== null || item.chosenGroupId !== null)
    ? await deps.schedule.listEvents(ctx.tenantId)
    : [];
  const today = toLocalDate((deps.clock ?? (() => new Date()))());

  return items.map((item) => {
    // §5.8: no pedido do app o cliente já escolheu a saída — ela vale mais que a sugestão.
    if (item.chosenGroupId) {
      const chosen = events.find((event) => event.group.id === item.chosenGroupId);
      return {
        ...item,
        suggestedGroupId: item.chosenGroupId,
        suggestedGroupName: chosen?.group.name ?? null,
      };
    }
    const suggestion = item.itineraryId ? nextOpenGroup(events, item.itineraryId, today) : null;
    return {
      ...item,
      suggestedGroupId: suggestion?.id ?? null,
      suggestedGroupName: suggestion?.name ?? null,
    };
  });
}

/**
 * O próximo grupo aberto de um roteiro: entre os grupos `open` do roteiro cuja saída
 * começa hoje ou depois, o de data mais próxima. Grupo passado ou não-aberto não é
 * sugestão. Função pura — a data de referência entra como parâmetro (sem `new Date()`).
 */
export function nextOpenGroup(
  events: readonly ScheduleEventWithGroup[],
  itineraryId: string,
  today: LocalDate,
): { id: string; name: string } | null {
  const upcoming = events
    .filter(
      (event) =>
        event.group.itineraryId === itineraryId &&
        event.group.status === 'open' &&
        compareLocalDate(event.event.startDate, today) >= 0,
    )
    .sort((a, b) => compareLocalDate(a.event.startDate, b.event.startDate));
  const next = upcoming[0];
  return next ? { id: next.group.id, name: next.group.name } : null;
}
