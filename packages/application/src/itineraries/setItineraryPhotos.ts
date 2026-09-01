import { BusinessRuleError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ItineraryDeps } from './priceInput.js';
import type { ItineraryPhotoRecord } from './itineraryRepository.js';

/**
 * RO-01 — grava a galeria de fotos do roteiro (substitui o conjunto inteiro). No máximo
 * 20 fotos e exatamente uma capa: se nenhuma vier marcada, a primeira vira capa. A ordem
 * de entrada é a ordem exibida. O arquivo em si vive no Storage por tenant; aqui só o path.
 */

const MAX_PHOTOS = 20;

export interface ItineraryPhotoInput {
  readonly storagePath: string;
  readonly alt?: string | null | undefined;
  readonly isCover?: boolean | undefined;
}

export interface SetItineraryPhotosCommand {
  readonly itineraryId: string;
  readonly photos: readonly ItineraryPhotoInput[];
}

export async function setItineraryPhotos(
  deps: ItineraryDeps,
  ctx: RequestContext,
  command: SetItineraryPhotosCommand,
): Promise<ItineraryPhotoRecord[]> {
  const itinerary = await deps.itineraries.findById(ctx.tenantId, command.itineraryId);
  if (!itinerary) throw new NotFoundError('roteiro');

  if (command.photos.length > MAX_PHOTOS) {
    throw new BusinessRuleError(
      'too_many_photos',
      `A galeria aceita no máximo ${MAX_PHOTOS} fotos`,
    );
  }

  const coverCount = command.photos.filter((p) => p.isCover).length;
  if (coverCount > 1) {
    throw new BusinessRuleError('multiple_covers', 'Escolha uma única foto de capa');
  }

  const normalized = command.photos.map((p, index) => ({
    storagePath: p.storagePath,
    alt: p.alt ?? null,
    isCover: coverCount === 0 ? index === 0 : Boolean(p.isCover),
  }));

  return deps.itineraries.setPhotos(ctx.tenantId, itinerary.id, normalized);
}
