import { requireSelfOrTeam } from './getCommunicationConsents.js';
import type { RequestContext } from '../context.js';
import type {
  CommunicationConsentRepository,
  ConsentChannel,
} from './communicationConsentRepository.js';

/**
 * DOC-06/CM-04 — liga ou desliga o consentimento de um canal. Conceder é idempotente;
 * revogar é o opt-out de um clique, com efeito imediato e histórico preservado. O canal
 * cobre só a comunicação promocional — o que é execução de contrato não passa por aqui.
 */

export interface SetCommunicationConsentDeps {
  readonly consents: CommunicationConsentRepository;
  readonly clock: () => Date;
}

export interface SetCommunicationConsentCommand {
  readonly customerId: string;
  readonly channel: ConsentChannel;
  readonly granted: boolean;
  readonly source?: string | undefined;
}

export async function setCommunicationConsent(
  deps: SetCommunicationConsentDeps,
  ctx: RequestContext,
  command: SetCommunicationConsentCommand,
): Promise<void> {
  requireSelfOrTeam(ctx, command.customerId);
  const now = deps.clock();
  if (command.granted) {
    await deps.consents.grant({
      tenantId: ctx.tenantId,
      customerId: command.customerId,
      channel: command.channel,
      source: command.source ?? sourceOf(ctx),
      grantedAt: now,
    });
  } else {
    await deps.consents.revoke(ctx.tenantId, command.customerId, command.channel, now);
  }
}

function sourceOf(ctx: RequestContext): string {
  return ctx.actor.kind === 'customer' ? 'portal' : 'admin';
}
