import { ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { SupplierRepository } from './supplierRepository.js';

/**
 * GR-19 — exclui (logicamente) um pagamento a fornecedor.
 *
 * Fechava uma assimetria: dava para excluir o recebimento do cliente (IN-11) e o gasto do
 * fornecedor (GR-18), mas não o pagamento **ao** fornecedor. Quem digitasse 1.200,00 no
 * lugar de 120,00 ficava com a margem do grupo errada e sem saída pela tela.
 *
 * Exclusão lógica: o dinheiro sai da leitura e fica na tabela. Ato financeiro, então
 * `owner`/`admin` como excluir recebimento (IN-09).
 *
 * Isto também destrava a mensagem do GR-18: o gasto recusa exclusão enquanto houver
 * pagamento e manda excluir os pagamentos antes — instrução que até agora não tinha como
 * ser seguida.
 */

export interface DeleteSupplierPaymentDeps {
  readonly suppliers: SupplierRepository;
  readonly audit: AuditLogRepository;
}

export interface DeleteSupplierPaymentCommand {
  readonly paymentId: string;
}

export async function deleteSupplierPayment(
  deps: DeleteSupplierPaymentDeps,
  ctx: RequestContext,
  command: DeleteSupplierPaymentCommand,
): Promise<void> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Excluir pagamento a fornecedor exige owner ou admin');
  }

  const payment = await deps.suppliers.findPaymentById(ctx.tenantId, command.paymentId);
  if (!payment) throw new NotFoundError('pagamento');

  await deps.suppliers.softDeletePayment(ctx.tenantId, payment.id);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'supplier_payment',
    entityId: payment.id,
    action: 'supplier_payment.delete',
    // Quanto era e de qual gasto: dinheiro que some sem deixar o valor é pior que dinheiro
    // que fica errado, porque ninguém consegue reconstruir depois.
    diff: {
      supplierExpenseId: payment.supplierExpenseId,
      amountCents: Number(payment.amountCents),
      method: payment.method,
    },
  });
}
