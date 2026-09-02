import { actorUserId } from '../audit/auditLogRepository.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
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
  /*
   * M5 — mesma exigência de `registerPayment` (dinheiro entrando) e de
   * `deleteSupplierPayment`. A assimetria era ao contrário do risco: registrar que o
   * dinheiro **saiu** bastava ser equipe, e um pagamento inventado a um fornecedor com
   * chave PIX recém-trocada fechava o círculo sem passar por ninguém.
   *
   * `addSupplierExpense` segue com o operador de propósito: é o compromisso, não o caixa,
   * e quem está na estrada precisa lançar a pousada no ato.
   */
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Registrar pagamento a fornecedor exige owner ou admin');
  }
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
    createdBy: actor.userId,
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
