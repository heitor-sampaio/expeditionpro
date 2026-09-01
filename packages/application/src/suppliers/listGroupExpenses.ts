import { ForbiddenError } from '../errors.js';
import { subCents, sumCents, zeroCents, type Cents } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { SupplierRepository } from './supplierRepository.js';

/**
 * GR-08/GR-09 — despesas de um grupo para a leitura da margem. Cada linha traz o
 * contratado (`total_cents` do expense), o **pago** (SOMA de `supplier_payments`,
 * nunca coluna) e o **em aberto** derivado. O nome do fornecedor é resolvido à parte.
 */

export interface ListGroupExpensesDeps {
  readonly suppliers: SupplierRepository;
}

export interface ListGroupExpensesCommand {
  readonly groupId: string;
}

export interface GroupExpenseRow {
  readonly id: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly description: string;
  readonly totalCents: number;
  readonly paidCents: number;
  readonly outstandingCents: number;
}

export async function listGroupExpenses(
  deps: ListGroupExpensesDeps,
  ctx: RequestContext,
  command: ListGroupExpensesCommand,
): Promise<GroupExpenseRow[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Os gastos do grupo são da equipe');
  }

  const expenses = await deps.suppliers.listExpensesByGroup(ctx.tenantId, command.groupId);
  const payments = await deps.suppliers.listPaymentsByGroup(ctx.tenantId, command.groupId);

  const paidByExpense = new Map<string, Cents>();
  for (const expense of expenses) {
    const amounts = payments
      .filter((payment) => payment.supplierExpenseId === expense.id)
      .map((payment) => payment.amountCents);
    paidByExpense.set(expense.id, amounts.length === 0 ? zeroCents : sumCents(amounts));
  }

  const nameBySupplier = new Map<string, string>();
  await Promise.all(
    [...new Set(expenses.map((e) => e.supplierId))].map(async (supplierId) => {
      const supplier = await deps.suppliers.findSupplierById(ctx.tenantId, supplierId);
      nameBySupplier.set(supplierId, supplier?.name ?? '—');
    }),
  );

  return expenses.map((expense) => {
    const paid = paidByExpense.get(expense.id) ?? zeroCents;
    return {
      id: expense.id,
      supplierId: expense.supplierId,
      supplierName: nameBySupplier.get(expense.supplierId) ?? '—',
      description: expense.description,
      totalCents: expense.totalCents,
      paidCents: paid,
      outstandingCents: subCents(expense.totalCents, paid),
    };
  });
}
