import { ForbiddenError } from '../errors.js';
import { toView, type ConnectedIntegration } from './connectPaymentProvider.js';
import type { RequestContext } from '../context.js';
import type { PaymentIntegrationRepository } from './paymentIntegrationRepository.js';

/**
 * PG-01 — o que a tela de Integrações mostra: quais ambientes estão conectados, em qual
 * conta, desde quando. **Nunca o token** — nem inteiro, nem parcial além dos quatro
 * últimos caracteres, que servem só para conferir qual chave está lá.
 */

export interface ListPaymentIntegrationsDeps {
  readonly integrations: PaymentIntegrationRepository;
}

export async function listPaymentIntegrations(
  deps: ListPaymentIntegrationsDeps,
  ctx: RequestContext,
): Promise<ConnectedIntegration[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A integração de pagamento é da equipe');
  }
  const rows = await deps.integrations.list(ctx.tenantId);
  return rows.map(toView);
}
