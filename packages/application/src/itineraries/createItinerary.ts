import { requireTeam } from './itineraryAudience.js';
import { BusinessRuleError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ItineraryRecord } from './itineraryRepository.js';
import { toPriceVersion, type ItineraryDeps, type PriceInput } from './priceInput.js';

/**
 * RO-01/02 — cria um roteiro com suas faixas etárias e a tabela de preços inicial.
 * O roteiro e o preço nascem juntos (atômico na infra). Faixas herdam o default
 * da empresa (menor até 5, maior 6–10) quando não vierem.
 */

const DEFAULT_YOUNG_MAX = 5;
const DEFAULT_MID_MAX = 10;

export interface CreateItineraryCommand {
  readonly name: string;
  readonly description?: string | undefined;
  readonly difficulty?: string | undefined;
  readonly kind?: 'catalog' | 'custom' | undefined;
  readonly childYoungMaxAge?: number | undefined;
  readonly childMidMaxAge?: number | undefined;
  readonly prices: PriceInput;
}

export async function createItinerary(
  deps: ItineraryDeps,
  ctx: RequestContext,
  command: CreateItineraryCommand,
): Promise<ItineraryRecord> {
  requireTeam(ctx);
  const childYoungMaxAge = command.childYoungMaxAge ?? DEFAULT_YOUNG_MAX;
  const childMidMaxAge = command.childMidMaxAge ?? DEFAULT_MID_MAX;
  if (childYoungMaxAge >= childMidMaxAge) {
    throw new BusinessRuleError(
      'invalid_age_bands',
      'A faixa etária menor precisa ser menor que a maior',
    );
  }

  return deps.itineraries.create(
    {
      tenantId: ctx.tenantId,
      name: command.name.trim(),
      slug: slugify(command.name),
      description: blankToNull(command.description),
      difficulty: blankToNull(command.difficulty),
      status: 'active',
      kind: command.kind ?? 'catalog',
      childYoungMaxAge,
      childMidMaxAge,
    },
    toPriceVersion(command.prices),
  );
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
