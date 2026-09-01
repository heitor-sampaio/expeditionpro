import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';
import type { FormMappingRecord, FormMappingRepository } from './formMappingRepository.js';

/**
 * IN-20 — configura o mapa `form_id` → roteiro de uma origem. Upsert por
 * `(source, form_id)`: reconfigurar o mesmo formulário troca o roteiro, não duplica.
 * Só owner/admin (é config que muda para onde a inscrição vai). O roteiro precisa existir
 * no tenant — mapa apontando para roteiro fantasma não ajuda ninguém a alocar.
 */

export interface SetFormMappingDeps {
  readonly formMappings: FormMappingRepository;
  readonly itineraries: ItineraryRepository;
}

export interface SetFormMappingCommand {
  readonly source: string;
  readonly formId: string;
  readonly itineraryId: string;
}

export async function setFormMapping(
  deps: SetFormMappingDeps,
  ctx: RequestContext,
  command: SetFormMappingCommand,
): Promise<FormMappingRecord> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Configurar integração exige owner ou admin');
  }

  const itinerary = await deps.itineraries.findById(ctx.tenantId, command.itineraryId);
  if (!itinerary) throw new NotFoundError('roteiro');

  return deps.formMappings.upsert(
    ctx.tenantId,
    command.source,
    command.formId,
    command.itineraryId,
  );
}
