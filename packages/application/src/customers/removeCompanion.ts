import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { CashbackRepository } from '../cashback/cashbackRepository.js';
import type { CustomerRepository } from './customerRepository.js';

/**
 * CL-03/CL-06 — remove um acompanhante cadastrado por engano.
 *
 * Só isso: quem já entrou numa inscrição ou tem cashback deixou histórico, e histórico
 * é imutável (§3.2.1) — a recusa vem aqui, com motivo legível, antes do RESTRICT das
 * FKs de participante e cashback, que é o backstop no banco.
 *
 * Responsável não sai por aqui: para desfazer uma família existem o vínculo (CL-10) e o
 * merge (CL-07). Apagar cadastro é irreversível, então exige owner/admin — mesmo peso da
 * alteração de identidade.
 */

export interface RemoveCompanionCommand {
  readonly customerId: string;
}

export interface RemoveCompanionDeps {
  readonly customers: CustomerRepository;
  readonly bookings: BookingRepository;
  readonly cashback: CashbackRepository;
  readonly audit: AuditLogRepository;
}

export async function removeCompanion(
  deps: RemoveCompanionDeps,
  ctx: RequestContext,
  command: RemoveCompanionCommand,
): Promise<void> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Remover cadastro exige owner ou admin');
  }

  const customer = await deps.customers.findById(ctx.tenantId, command.customerId);
  if (!customer) throw new NotFoundError('cliente');

  if (customer.responsibleId === null) {
    throw new BusinessRuleError(
      'not_a_companion',
      'Só acompanhante é removido aqui; para o responsável use vínculo ou merge',
    );
  }

  const bookings = await deps.bookings.listByCustomer(ctx.tenantId, customer.id);
  if (bookings.length > 0) {
    throw new BusinessRuleError('has_history', 'Este acompanhante já participou de uma saída');
  }

  const cashback = await deps.cashback.listByCustomer(ctx.tenantId, customer.id);
  if (cashback.length > 0) {
    throw new BusinessRuleError('has_history', 'Este acompanhante tem lançamento de cashback');
  }

  await deps.customers.deleteCustomer(ctx.tenantId, customer.id);
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'customer',
    entityId: customer.id,
    action: 'customer.remove',
    diff: { from: customer.responsibleId },
  });
}
