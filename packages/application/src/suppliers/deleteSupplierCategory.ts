import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { WriteSupplierCategoryDeps } from './createSupplierCategory.js';

/**
 * FO-05 — exclui uma categoria de fornecedor, e **só se ninguém a usa**.
 *
 * A FK é `ON DELETE SET NULL`. Sem esta trava, excluir desvincularia os fornecedores em
 * silêncio — e, como o gasto herda a categoria do fornecedor, o histórico inteiro do
 * relatório mudaria sem que ninguém tivesse decidido isso. Reescrever o passado é
 * aceitável quando alguém **escolhe** (renomear, recategorizar), nunca como efeito
 * colateral de um "Excluir".
 *
 * Não é exclusão lógica: a tabela não tem `deleted_at`, e com a trava acima só se exclui
 * categoria sem uso — aí não há histórico a preservar. Quem quiser aposentar uma categoria
 * em uso troca a categoria dos fornecedores primeiro, que é reversível.
 */

export interface DeleteSupplierCategoryCommand {
  readonly id: string;
}

export async function deleteSupplierCategory(
  deps: WriteSupplierCategoryDeps,
  ctx: RequestContext,
  command: DeleteSupplierCategoryCommand,
): Promise<void> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Excluir categoria exige owner ou admin');
  }

  const current = await deps.suppliers.findCategoryById(ctx.tenantId, command.id);
  if (!current) throw new NotFoundError('categoria');

  const emUso = await deps.suppliers.countSuppliersByCategory(ctx.tenantId, current.id);
  if (emUso > 0) {
    throw new BusinessRuleError(
      'category_in_use',
      `${String(emUso)} fornecedor(es) usam esta categoria. Troque a categoria deles antes de excluir.`,
    );
  }

  await deps.suppliers.deleteCategory(ctx.tenantId, current.id);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'supplier_category',
    entityId: current.id,
    action: 'supplier_category.delete',
    diff: { name: current.name },
  });
}
