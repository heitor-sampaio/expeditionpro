import { requireWriter } from '../audience.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ItineraryDeps } from './priceInput.js';
import type { ItineraryRecord } from './itineraryRepository.js';
import { resolveItinerarySlug } from './resolveItinerarySlug.js';

/**
 * RO-01/02 — edita um roteiro. Campos não informados no comando preservam o valor atual. Só
 * toca metadados do roteiro — o preço é versionado à parte (RO-03) e nunca muda por aqui.
 *
 * **Renomear não mexe no slug.** Ele nasce do nome na criação e a partir daí é um campo
 * próprio, porque virou o endereço do link público de inscrição (IN-25): recalculá-lo a cada
 * rename derrubaria todo anúncio já pago que aponta para o endereço antigo. Quem quiser o
 * endereço novo manda `slug` de propósito.
 */

export interface UpdateItineraryCommand {
  readonly id: string;
  readonly name?: string | undefined;
  /** RO-02: o endereço do link público. Só muda quando vem no comando — ver abaixo. */
  readonly slug?: string | undefined;
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

  const slug = command.slug?.trim()
    ? await resolveItinerarySlug(deps.itineraries, ctx.tenantId, command.slug, current.id)
    : current.slug;

  return deps.itineraries.update(ctx.tenantId, current.id, {
    name,
    slug,
    description:
      command.description === undefined ? current.description : blankToNull(command.description),
    difficulty:
      command.difficulty === undefined ? current.difficulty : blankToNull(command.difficulty),
    status: command.status ?? current.status,
    childYoungMaxAge,
    childMidMaxAge,
  });
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
