import { requireSelfOrTeam } from './getCommunicationConsents.js';
import type { RequestContext } from '../context.js';
import type { MediaConsentRepository, MediaScope } from './mediaConsentRepository.js';

/**
 * CO-10 — liga/desliga o consentimento de uso de imagem num escopo. Conceder é idempotente;
 * revogar tem efeito imediato e histórico preservado (ônus da prova é do controlador, LGPD).
 */

export interface SetMediaConsentDeps {
  readonly media: MediaConsentRepository;
  readonly clock: () => Date;
}

export interface SetMediaConsentCommand {
  readonly customerId: string;
  readonly scope: MediaScope;
  readonly granted: boolean;
  readonly source?: string | undefined;
}

export async function setMediaConsent(
  deps: SetMediaConsentDeps,
  ctx: RequestContext,
  command: SetMediaConsentCommand,
): Promise<void> {
  requireSelfOrTeam(ctx, command.customerId);
  const now = deps.clock();
  if (command.granted) {
    await deps.media.grant({
      tenantId: ctx.tenantId,
      customerId: command.customerId,
      scope: command.scope,
      source: command.source ?? (ctx.actor.kind === 'customer' ? 'portal' : 'admin'),
      grantedAt: now,
    });
  } else {
    await deps.media.revoke(ctx.tenantId, command.customerId, command.scope, now);
  }
}
