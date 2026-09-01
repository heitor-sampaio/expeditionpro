import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { SupplierCategoryRecord } from './supplierRepository.js';
import type { WriteSupplierCategoryDeps } from './createSupplierCategory.js';

export type { WriteSupplierCategoryDeps };

/**
 * FO-05 — renomeia uma categoria de fornecedor.
 *
 * O nome não é gravado no fornecedor: ele é resolvido na leitura, por junção. Então
 * renomear alcança **todo o histórico** de uma vez — que é o comportamento pedido, porque
 * a categoria é do fornecedor e o gasto a herda. Corrigir "Hospedagm" conserta o relatório
 * inteiro; por isso mesmo, exige owner ou admin.
 */

export interface RenameSupplierCategoryCommand {
  readonly id: string;
  readonly name: string;
}

export async function renameSupplierCategory(
  deps: WriteSupplierCategoryDeps,
  ctx: RequestContext,
  command: RenameSupplierCategoryCommand,
): Promise<SupplierCategoryRecord> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Renomear categoria exige owner ou admin');
  }

  const name = command.name.trim();
  if (name.length === 0) throw new RequiredFieldError('nome da categoria');

  const current = await deps.suppliers.findCategoryById(ctx.tenantId, command.id);
  if (!current) throw new NotFoundError('categoria');

  // O unique é (tenant_id, name): sem esta checagem o conflito viria cru do banco, como 500.
  const taken = await deps.suppliers.findCategoryByName(ctx.tenantId, name);
  if (taken && taken.id !== current.id) {
    throw new BusinessRuleError('category_name_taken', 'Já existe uma categoria com esse nome');
  }

  const renamed = await deps.suppliers.renameCategory(ctx.tenantId, current.id, name);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'supplier_category',
    entityId: current.id,
    action: 'supplier_category.rename',
    diff: { from: current.name, to: name },
  });

  return renamed;
}
