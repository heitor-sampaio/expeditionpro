import { NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import { ASAAS, assertCanManage } from './connectPaymentProvider.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type {
  PaymentEnvironment,
  PaymentIntegrationRepository,
} from './paymentIntegrationRepository.js';

/**
 * PG-01 — desconecta a conta: a credencial some do banco. As cobranças já emitidas
 * continuam existindo (são histórico), mas nenhuma nova sai, e o webhook daquele
 * ambiente deixa de ser aceito — o segredo foi embora junto.
 */

export interface DisconnectPaymentProviderDeps {
  readonly integrations: PaymentIntegrationRepository;
  readonly audit: AuditLogRepository;
}

export interface DisconnectPaymentProviderCommand {
  readonly environment: PaymentEnvironment;
}

export async function disconnectPaymentProvider(
  deps: DisconnectPaymentProviderDeps,
  ctx: RequestContext,
  command: DisconnectPaymentProviderCommand,
): Promise<void> {
  assertCanManage(ctx);

  const existing = await deps.integrations.find(ctx.tenantId, ASAAS, command.environment);
  if (!existing) {
    throw new NotFoundError('integração');
  }

  await deps.integrations.remove(ctx.tenantId, ASAAS, command.environment);
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'payment_integration',
    entityId: existing.id,
    action: 'payment_integration.disconnect',
    diff: { provider: ASAAS, environment: command.environment },
  });
}
