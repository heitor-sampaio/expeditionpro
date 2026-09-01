import { requireSelfOrTeam } from './getCommunicationConsents.js';
import type { RequestContext } from '../context.js';
import type { MediaConsentRepository } from './mediaConsentRepository.js';

/**
 * CO-10 — estado do consentimento de imagem por escopo. A equipe consulta qualquer
 * cliente; o cliente só a si. Desmarcado por padrão (uso de imagem não se presume).
 */

export interface GetMediaConsentsDeps {
  readonly media: MediaConsentRepository;
}

export interface MediaConsentState {
  readonly community: boolean;
  readonly marketing: boolean;
}

export async function getMediaConsents(
  deps: GetMediaConsentsDeps,
  ctx: RequestContext,
  command: { readonly customerId: string },
): Promise<MediaConsentState> {
  requireSelfOrTeam(ctx, command.customerId);
  const active = await deps.media.listActiveScopes(ctx.tenantId, command.customerId);
  return { community: active.includes('community'), marketing: active.includes('marketing') };
}
