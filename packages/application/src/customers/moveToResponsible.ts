import { BusinessRuleError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CustomerRecord, CustomerRepository } from './customerRepository.js';

/**
 * CL-10 — vincula um cliente a um responsável. Cobre duas operações do §3.2.1 que
 * são mecanicamente a mesma: "mover para outra família" (acompanhante → outro
 * responsável) e "vincular como acompanhante" (responsável → acompanhante de outro).
 *
 * Guardas: o destino precisa ser um responsável; não vincular a si mesmo; e um
 * cliente com acompanhantes não pode virar acompanhante (não cria órfão nem terceiro
 * nível — o trigger CL-11 é o backstop).
 */

export interface MoveToResponsibleCommand {
  readonly customerId: string;
  readonly responsibleId: string;
}

export interface MoveToResponsibleDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLogRepository;
}

export async function moveToResponsible(
  deps: MoveToResponsibleDeps,
  ctx: RequestContext,
  command: MoveToResponsibleCommand,
): Promise<CustomerRecord> {
  if (command.customerId === command.responsibleId) {
    throw new BusinessRuleError('self_link', 'Um cliente não pode ser vinculado a si mesmo');
  }

  const customer = await deps.customers.findById(ctx.tenantId, command.customerId);
  if (!customer) throw new NotFoundError('cliente');

  const target = await deps.customers.findById(ctx.tenantId, command.responsibleId);
  if (!target) throw new NotFoundError('responsável');
  if (target.responsibleId !== null) {
    throw new BusinessRuleError('not_a_responsible', 'O destino precisa ser um responsável');
  }

  const dependents = await deps.customers.listByResponsible(ctx.tenantId, customer.id);
  if (dependents.length > 0) {
    throw new BusinessRuleError(
      'has_dependents',
      'Realoque ou promova os dependentes antes de vincular',
    );
  }

  const moved = await deps.customers.updateResponsible(ctx.tenantId, customer.id, target.id);
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'customer',
    entityId: customer.id,
    action: 'family.move',
    diff: { from: customer.responsibleId, to: target.id },
  });
  return moved;
}
