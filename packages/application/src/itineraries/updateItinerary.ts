import { requireWriter } from '../audience.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ItineraryDeps } from './priceInput.js';
import type { ItineraryRecord } from './itineraryRepository.js';

/**
 * RO-01/02 — edita um roteiro. Campos não informados no comando preservam o valor
 * atual; nome novo recalcula o slug. Só toca metadados do roteiro — o preço é
 * versionado à parte (RO-03) e nunca muda por aqui.
 */

export interface UpdateItineraryCommand {
  readonly id: string;
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly difficulty?: string | undefined;
  readonly status?: string | undefined;
  readonly childYoungMaxAge?: number | undefined;
  readonly childMidMaxAge?: number | undefined;
}

export async function updateItinerary(
  deps: ItineraryDeps,
  ctx: RequestContext,
  command: UpdateItineraryCommand,
): Promise<ItineraryRecord> {
  requireWriter(ctx);
  const current = await deps.itineraries.findById(ctx.tenantId, command.id);
  if (!current) throw new NotFoundError('roteiro');

  const childYoungMaxAge = command.childYoungMaxAge ?? current.childYoungMaxAge;
  const childMidMaxAge = command.childMidMaxAge ?? current.childMidMaxAge;
  if (childYoungMaxAge >= childMidMaxAge) {
    throw new BusinessRuleError(
      'invalid_age_bands',
      'A faixa etária menor precisa ser menor que a maior',
    );
  }

  const name = command.name?.trim() ? command.name.trim() : current.name;

  return deps.itineraries.update(ctx.tenantId, current.id, {
    name,
    slug: command.name?.trim() ? slugify(command.name) : current.slug,
    description:
      command.description === undefined ? current.description : blankToNull(command.description),
    difficulty:
      command.difficulty === undefined ? current.difficulty : blankToNull(command.difficulty),
    status: command.status ?? current.status,
    childYoungMaxAge,
    childMidMaxAge,
  });
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
