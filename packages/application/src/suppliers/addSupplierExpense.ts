import { cents } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { SupplierExpenseRecord, SupplierRepository } from './supplierRepository.js';

/**
 * GR-08 — lança um gasto contratado com um fornecedor num grupo. `total_cents` é o
 * contratado; o pago é a soma dos pagamentos (GR-09). Valida grupo e fornecedor no tenant.
 */

export interface AddSupplierExpenseDeps {
  readonly suppliers: SupplierRepository;
  readonly schedule: ScheduleRepository;
}

export interface AddSupplierExpenseCommand {
  readonly groupId: string;
  readonly supplierId: string;
  readonly description: string;
  readonly totalCents: number;
}

export async function addSupplierExpense(
  deps: AddSupplierExpenseDeps,
  ctx: RequestContext,
  command: AddSupplierExpenseCommand,
): Promise<SupplierExpenseRecord> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Lançar gasto é da equipe');
  }

  const description = command.description.trim();
  if (description.length === 0) {
    throw new RequiredFieldError('descrição');
  }
  if (!Number.isInteger(command.totalCents) || command.totalCents <= 0) {
    throw new BusinessRuleError('invalid_amount', 'Valor do gasto deve ser positivo');
  }

  const group = await deps.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!group) {
    throw new NotFoundError('grupo');
  }
  const supplier = await deps.suppliers.findSupplierById(ctx.tenantId, command.supplierId);
  if (!supplier) {
    throw new NotFoundError('fornecedor');
  }

  return deps.suppliers.addExpense({
    tenantId: ctx.tenantId,
    groupId: command.groupId,
    supplierId: command.supplierId,
    description,
    totalCents: cents(command.totalCents),
  });
}
