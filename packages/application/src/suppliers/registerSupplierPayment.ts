import { actorUserId } from '../audit/auditLogRepository.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import { requireWriter } from '../audience.js';
import { cents, parseLocalDate } from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { SupplierPaymentRecord, SupplierRepository } from './supplierRepository.js';

/**
 * GR-09 — registra um pagamento a fornecedor num gasto. Movimento de dinheiro: só a
 * equipe lança (cliente nunca toca no financeiro de fornecedor — PC-05). O pago é a
 * soma destes lançamentos, nunca coluna.
 */

export interface RegisterSupplierPaymentDeps {
  readonly suppliers: SupplierRepository;
  readonly audit: AuditLogRepository;
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
  requireWriter(ctx);
  if (!Number.isInteger(command.amountCents) || command.amountCents <= 0) {
    throw new BusinessRuleError('invalid_amount', 'Valor do pagamento deve ser positivo');
  }

  const expense = await deps.suppliers.findExpenseById(ctx.tenantId, command.expenseId);
  if (!expense) {
    throw new NotFoundError('gasto');
  }

  const payment = await deps.suppliers.addPayment({
    tenantId: ctx.tenantId,
    supplierExpenseId: command.expenseId,
    paidAt: parseLocalDate(command.paidAt),
    amountCents: cents(command.amountCents),
    method: command.method,
    reference: blankToNull(command.reference),
    notes: blankToNull(command.notes),
    createdBy: ctx.actor.userId,
  });

  // A09 — mesma assimetria do gasto: `deleteSupplierPayment` (GR-19) gravava, pagar não.
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'supplier_payment',
    entityId: payment.id,
    action: 'supplier_payment.register',
    diff: {
      supplierExpenseId: command.expenseId,
      amountCents: command.amountCents,
      method: command.method,
    },
  });

  return payment;
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
