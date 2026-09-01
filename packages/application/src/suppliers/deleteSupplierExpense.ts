import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { SupplierRepository } from './supplierRepository.js';

/**
 * GR-18 — exclui um gasto lançado errado.
 *
 * **Exclusão lógica.** O registro sai das leituras e fica na tabela: é lançamento
 * financeiro, e registro que teve dinheiro associado não se apaga. As leituras já
 * respeitavam `deleted_at` desde sempre — só faltava quem o marcasse.
 *
 * **Gasto com pagamento não se exclui** (`expense_has_payments`). O pagamento é casado com
 * o grupo, não com o gasto vivo: apagar o gasto deixaria o dinheiro pago contando como
 * "pago aos fornecedores" sem contratado por trás, e a margem do grupo sairia errada sem
 * nada na tela dizendo por quê. Quem pagou errado corrige por acerto com o fornecedor, não
 * apagando a obrigação que originou o pagamento.
 *
 * Só owner/admin, como excluir recebimento (IN-09): é o mesmo tipo de ato.
 */

export interface DeleteSupplierExpenseDeps {
  readonly suppliers: SupplierRepository;
  readonly audit: AuditLogRepository;
}

export interface DeleteSupplierExpenseCommand {
  readonly expenseId: string;
}

export async function deleteSupplierExpense(
  deps: DeleteSupplierExpenseDeps,
  ctx: RequestContext,
  command: DeleteSupplierExpenseCommand,
): Promise<void> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Excluir gasto exige owner ou admin');
  }

  const expense = await deps.suppliers.findExpenseById(ctx.tenantId, command.expenseId);
  if (!expense) throw new NotFoundError('gasto');

  const pagamentos = await deps.suppliers.countPaymentsByExpense(ctx.tenantId, expense.id);
  if (pagamentos > 0) {
    throw new BusinessRuleError(
      'expense_has_payments',
      `Este gasto tem ${String(pagamentos)} pagamento(s) lançado(s). Exclua os pagamentos antes, ou acerte com o fornecedor.`,
    );
  }

  await deps.suppliers.softDeleteExpense(ctx.tenantId, expense.id);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'supplier_expense',
    entityId: expense.id,
    action: 'supplier_expense.delete',
    // O que sumiu da mesa: sem isso, um gasto excluído some sem deixar quanto era.
    diff: {
      groupId: expense.groupId,
      supplierId: expense.supplierId,
      description: expense.description,
      totalCents: Number(expense.totalCents),
    },
  });
}
