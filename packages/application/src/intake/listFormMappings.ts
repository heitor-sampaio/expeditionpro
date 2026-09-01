import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';
import type { FormMappingRecord, FormMappingRepository } from './formMappingRepository.js';

/**
 * IN-20 — lista os mapas do tenant, cada um com o nome do roteiro (de→para legível na
 * tela de Integrações). É da equipe.
 */

export interface ListFormMappingsDeps {
  readonly formMappings: FormMappingRepository;
  readonly itineraries: ItineraryRepository;
}

export interface EnrichedFormMapping {
  readonly mapping: FormMappingRecord;
  readonly itineraryName: string | null;
}

export async function listFormMappings(
  deps: ListFormMappingsDeps,
  ctx: RequestContext,
): Promise<EnrichedFormMapping[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A configuração de integrações é da equipe');
  }
  const rows = await deps.formMappings.list(ctx.tenantId);
  return Promise.all(
    rows.map(async (mapping) => {
      const itinerary = await deps.itineraries.findById(ctx.tenantId, mapping.itineraryId);
      return { mapping, itineraryName: itinerary?.name ?? null };
    }),
  );
}
