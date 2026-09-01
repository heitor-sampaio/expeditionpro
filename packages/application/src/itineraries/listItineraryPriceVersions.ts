import { requireTeam } from './itineraryAudience.js';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ItineraryDeps } from './priceInput.js';
import type { PriceVersionRecord } from './itineraryRepository.js';

/**
 * RO-03 — histórico de preço de um roteiro: todas as versões por `valid_from` (o log de
 * reajustes). Só leitura; a versão vigente numa data é resolvida por `resolveItineraryPrices`.
 */

export interface ListItineraryPriceVersionsCommand {
  readonly itineraryId: string;
}

export async function listItineraryPriceVersions(
  deps: ItineraryDeps,
  ctx: RequestContext,
  command: ListItineraryPriceVersionsCommand,
): Promise<PriceVersionRecord[]> {
  requireTeam(ctx);
  const itinerary = await deps.itineraries.findById(ctx.tenantId, command.itineraryId);
  if (!itinerary) throw new NotFoundError('roteiro');
  return deps.itineraries.listPrices(ctx.tenantId, command.itineraryId);
}
