import { readableItinerary } from './itineraryAudience.js';
import { parseLocalDate, resolveApplicablePrice, type PriceTable } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { ItineraryDeps } from './priceInput.js';

/**
 * Tabela de preços vigente de um roteiro numa data (§3.4). É o que a alocação usa
 * para congelar o snapshot: a versão mais recente cujo valid_from <= a data de
 * início do grupo. Sem versão vigente, null.
 */

export interface ResolveItineraryPricesCommand {
  readonly itineraryId: string;
  readonly atDate: string; // ISO YYYY-MM-DD (data de início do grupo)
}

export async function resolveItineraryPrices(
  deps: ItineraryDeps,
  ctx: RequestContext,
  command: ResolveItineraryPricesCommand,
): Promise<PriceTable | null> {
  /*
   * A apresentação do roteiro mostra preço, então o cliente lê — mas só o da vitrine.
   * `readableItinerary` devolve NotFound para o que está fora, sem confirmar existência.
   */
  await readableItinerary(deps, ctx, command.itineraryId);
  const versions = await deps.itineraries.listPrices(ctx.tenantId, command.itineraryId);
  return resolveApplicablePrice(versions, parseLocalDate(command.atDate));
}
