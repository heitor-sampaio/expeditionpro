import { BusinessRuleError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { VehicleRepository } from '../vehicles/vehicleRepository.js';
import type { CustomerRecord, CustomerRepository } from './customerRepository.js';

/**
 * CL-07 — mescla dois clientes duplicados (mesma pessoa, dois registros). O
 * histórico do duplicado é reatribuído ao sobrevivente e o duplicado é removido.
 *
 * Hoje o histórico são veículos e acompanhantes; quando entrarem inscrições,
 * pagamentos e cashback (fases 2/3/5), a reatribuição cresce aqui, e as escritas
 * passam a exigir uma transação (UnitOfWork) para o merge ser atômico. Cashback e
 * financeiro seguem o cliente, não a família (§3.2.1).
 */

export interface MergeCustomersCommand {
  readonly survivorId: string;
  readonly duplicateId: string;
}

export interface MergeCustomersDeps {
  readonly customers: CustomerRepository;
  readonly vehicles: VehicleRepository;
  readonly audit: AuditLogRepository;
}

export async function mergeCustomers(
  deps: MergeCustomersDeps,
  ctx: RequestContext,
  command: MergeCustomersCommand,
): Promise<CustomerRecord> {
  if (command.survivorId === command.duplicateId) {
    throw new BusinessRuleError('merge_self', 'Não é possível mesclar um cliente com ele mesmo');
  }

  const survivor = await deps.customers.findById(ctx.tenantId, command.survivorId);
  if (!survivor) throw new NotFoundError('cliente sobrevivente');
  const duplicate = await deps.customers.findById(ctx.tenantId, command.duplicateId);
  if (!duplicate) throw new NotFoundError('cliente duplicado');

  const duplicateDependents = await deps.customers.listByResponsible(ctx.tenantId, duplicate.id);
  if (duplicateDependents.length > 0 && survivor.responsibleId !== null) {
    throw new BusinessRuleError(
      'survivor_not_responsible',
      'O sobrevivente precisa ser responsável para herdar os acompanhantes do duplicado',
    );
  }

  await deps.vehicles.reassignVehicles(ctx.tenantId, duplicate.id, survivor.id);
  await deps.customers.reassignDependents(ctx.tenantId, duplicate.id, survivor.id);
  await deps.customers.deleteCustomer(ctx.tenantId, duplicate.id);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'customer',
    entityId: survivor.id,
    action: 'customer.merge',
    diff: { merged: duplicate.id },
  });

  return survivor;
}
