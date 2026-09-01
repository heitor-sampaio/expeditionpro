import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { FormMappingRepository } from './formMappingRepository.js';

/**
 * IN-20 — remove um mapa `form_id` → roteiro. Só owner/admin. Some da fila de resolução:
 * inscrições futuras daquele formulário chegam sem roteiro sugerido, para o admin escolher.
 */

export interface RemoveFormMappingDeps {
  readonly formMappings: FormMappingRepository;
}

export interface RemoveFormMappingCommand {
  readonly id: string;
}

export async function removeFormMapping(
  deps: RemoveFormMappingDeps,
  ctx: RequestContext,
  command: RemoveFormMappingCommand,
): Promise<void> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Configurar integração exige owner ou admin');
  }
  const removed = await deps.formMappings.remove(ctx.tenantId, command.id);
  if (!removed) throw new NotFoundError('mapa');
}
