import { cents, parseLocalDate } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { SupplierPaymentRecord, SupplierRepository } from './supplierRepository.js';

/**
 * GR-09 — registra um pagamento a fornecedor num gasto. Movimento de dinheiro: só a
 * equipe lança (cliente nunca toca no financeiro de fornecedor — PC-05). O pago é a
 * soma destes lançamentos, nunca coluna.
 */

export interface RegisterSupplierPaymentDeps {
  readonly suppliers: SupplierRepository;
}

export interface RegisterSupplierPaymentCommand {
  readonly expenseId: string;
  readonly amountCents: number;
  readonly method: string;
  readonly paidAt: string;
  readonly reference?: string | undefined;
  readonly notes?: string | undefined;
}

export async function registerSupplierPayment(
  deps: RegisterSupplierPaymentDeps,
  ctx: RequestContext,
  command: RegisterSupplierPaymentCommand,
): Promise<SupplierPaymentRecord> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Pagamento a fornecedor é lançado apenas pela equipe');
  }
  if (!Number.isInteger(command.amountCents) || command.amountCents <= 0) {
    throw new BusinessRuleError('invalid_amount', 'Valor do pagamento deve ser positivo');
  }

  const expense = await deps.suppliers.findExpenseById(ctx.tenantId, command.expenseId);
  if (!expense) {
    throw new NotFoundError('gasto');
  }

  return deps.suppliers.addPayment({
    tenantId: ctx.tenantId,
    supplierExpenseId: command.expenseId,
    paidAt: parseLocalDate(command.paidAt),
    amountCents: cents(command.amountCents),
    method: command.method,
    reference: blankToNull(command.reference),
    notes: blankToNull(command.notes),
    createdBy: ctx.actor.userId,
  });
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
