import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { SupplierCategoryDeps } from './createSupplierCategory.js';
import type { SupplierCategoryRecord } from './supplierRepository.js';

/** FO-04 — lista as categorias de fornecedor do tenant (para o seletor e o relatório). */
export async function listSupplierCategories(
  deps: SupplierCategoryDeps,
  ctx: RequestContext,
): Promise<SupplierCategoryRecord[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('As categorias de fornecedor são da equipe');
  }

  return deps.suppliers.listCategories(ctx.tenantId);
}
