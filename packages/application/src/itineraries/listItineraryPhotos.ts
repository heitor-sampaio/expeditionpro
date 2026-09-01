import { readableItinerary } from './itineraryAudience.js';
import type { RequestContext } from '../context.js';
import type { ItineraryDeps } from './priceInput.js';
import type { ItineraryPhotoRecord } from './itineraryRepository.js';

/**
 * RO-01 — a galeria de um roteiro. O cliente só alcança a de roteiro da vitrine; a rota
 * lia o repositório direto, sem passar por audiência nenhuma.
 */

export interface ListItineraryPhotosCommand {
  readonly itineraryId: string;
}

export async function listItineraryPhotos(
  deps: ItineraryDeps,
  ctx: RequestContext,
  command: ListItineraryPhotosCommand,
): Promise<ItineraryPhotoRecord[]> {
  await readableItinerary(deps, ctx, command.itineraryId);
  return deps.itineraries.listPhotos(ctx.tenantId, command.itineraryId);
}
