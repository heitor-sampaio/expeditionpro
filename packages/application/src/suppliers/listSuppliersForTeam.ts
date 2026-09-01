import { requireTeam } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { SupplierRecord, SupplierRepository } from './supplierRepository.js';

/**
 * FO-01 · SEC-01 — a lista de fornecedores, que é da equipe.
 *
 * Nasce aqui porque a rota lia o repositório **direto**: não havia onde a guarda coubesse,
 * e um token de cliente recebia todos os fornecedores com documento inteiro, telefone,
 * e-mail e chave PIX. O DTO da rota até dizia "a área de fornecedor é só da equipe
 * (SEC-01), que é a audiência autorizada" — a rota é que não cumpria.
 */

export interface ListSuppliersDeps {
  readonly suppliers: SupplierRepository;
}

export async function listSuppliersForTeam(
  deps: ListSuppliersDeps,
  ctx: RequestContext,
): Promise<SupplierRecord[]> {
  requireTeam(ctx);
  return deps.suppliers.listSuppliers(ctx.tenantId);
}
