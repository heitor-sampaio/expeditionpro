import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CommunicationConsentRepository } from './communicationConsentRepository.js';

/**
 * DOC-06/CM-04 — estado atual do consentimento por canal de um cliente. A equipe
 * consulta qualquer cliente; o cliente só a si (portal). Desmarcado por padrão.
 */

export interface GetCommunicationConsentsDeps {
  readonly consents: CommunicationConsentRepository;
}

export interface CommunicationConsentState {
  readonly email: boolean;
  readonly push: boolean;
}

export async function getCommunicationConsents(
  deps: GetCommunicationConsentsDeps,
  ctx: RequestContext,
  command: { readonly customerId: string },
): Promise<CommunicationConsentState> {
  requireSelfOrTeam(ctx, command.customerId);
  const active = await deps.consents.listActiveChannels(ctx.tenantId, command.customerId);
  return { email: active.includes('email'), push: active.includes('push') };
}

/** O cliente só age sobre o próprio consentimento; a equipe, sobre qualquer um. */
export function requireSelfOrTeam(ctx: RequestContext, customerId: string): void {
  if (ctx.actor.kind === 'customer' && ctx.actor.customerId !== customerId) {
    throw new ForbiddenError('Cliente só gerencia o próprio consentimento');
  }
}
