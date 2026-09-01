import { requireTeam } from './itineraryAudience.js';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import { toPriceVersion, type ItineraryDeps, type PriceInput } from './priceInput.js';

/**
 * RO-03 — adiciona uma versão de preço ao roteiro, vigente a partir de valid_from.
 * Reajuste nunca altera inscrição existente; a versão antiga continua valendo para
 * saídas anteriores (§3.4).
 */

export interface AddItineraryPriceVersionCommand extends PriceInput {
  readonly itineraryId: string;
}

export async function addItineraryPriceVersion(
  deps: ItineraryDeps,
  ctx: RequestContext,
  command: AddItineraryPriceVersionCommand,
): Promise<void> {
  requireTeam(ctx);
  const itinerary = await deps.itineraries.findById(ctx.tenantId, command.itineraryId);
  if (!itinerary) throw new NotFoundError('roteiro');
  await deps.itineraries.addPriceVersion(ctx.tenantId, itinerary.id, toPriceVersion(command));
}
