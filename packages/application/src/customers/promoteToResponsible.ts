import { requireWriter } from '../audience.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CustomerRecord, CustomerRepository } from './customerRepository.js';

/**
 * CL-10 — "tornar responsável" (§3.2.1). O cliente passa a formar a própria família
 * (responsible_id = null) e, opcionalmente, leva acompanhantes selecionados da
 * família de origem — o caso do casal com filhos que se separa da família dos pais.
 *
 * Os acompanhantes a levar precisam ser da mesma família de origem (irmãos do
 * cliente). Valida tudo antes de mutar, para não deixar promoção pela metade.
 */

export interface PromoteToResponsibleCommand {
  readonly customerId: string;
  readonly bringCompanionIds?: readonly string[] | undefined;
}

export interface PromoteToResponsibleDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLogRepository;
}

export async function promoteToResponsible(
  deps: PromoteToResponsibleDeps,
  ctx: RequestContext,
  command: PromoteToResponsibleCommand,
): Promise<CustomerRecord> {
  requireWriter(ctx);
  const customer = await deps.customers.findById(ctx.tenantId, command.customerId);
  if (!customer) throw new NotFoundError('cliente');

  const origin = customer.responsibleId;
  const bring = command.bringCompanionIds ?? [];

  // Valida os acompanhantes a levar antes de qualquer escrita.
  for (const companionId of bring) {
    const companion = await deps.customers.findById(ctx.tenantId, companionId);
    if (!companion) throw new NotFoundError('acompanhante');
    if (origin === null || companion.responsibleId !== origin) {
      throw new BusinessRuleError(
        'not_same_family',
        'Só é possível levar acompanhantes da família de origem',
      );
    }
  }

  const promoted = await deps.customers.updateResponsible(ctx.tenantId, customer.id, null);
  for (const companionId of bring) {
    await deps.customers.updateResponsible(ctx.tenantId, companionId, customer.id);
  }
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'customer',
    entityId: customer.id,
    action: 'family.promote',
    diff: { from: origin, to: null, brought: [...bring] },
  });
  return promoted;
}
