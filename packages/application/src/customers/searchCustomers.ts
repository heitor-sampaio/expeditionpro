import { denyCustomer } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { CustomerRecord, CustomerRepository, CustomerSort } from './customerRepository.js';

/**
 * CL-04 — lista/busca clientes retornando a FAMÍLIA inteira, ordenada por nome ou criação.
 *
 * Query vazia lista todas as famílias (todos os responsáveis + seus acompanhantes). Com
 * query, bater em qualquer membro (responsável ou acompanhante) resolve a família toda —
 * por isso o resultado é agrupado por responsável, e um acompanhante encontrado traz o
 * responsável e os irmãos junto. A ordenação é aplicada pelo repositório.
 */

export interface Family {
  readonly responsible: CustomerRecord;
  readonly companions: readonly CustomerRecord[];
}

export interface SearchCustomersDeps {
  readonly customers: CustomerRepository;
}

export interface ListCustomersParams {
  readonly query: string;
  readonly sort: CustomerSort;
}

export async function searchCustomers(
  deps: SearchCustomersDeps,
  ctx: RequestContext,
  params: ListCustomersParams,
): Promise<Family[]> {
  denyCustomer(ctx);
  const query = params.query.trim();

  // Sem busca: lista todos os responsáveis já ordenados; a ordem é preservada nas famílias.
  if (query === '') {
    const heads = await deps.customers.listResponsibles(ctx.tenantId, params.sort);
    return familiesOf(
      deps,
      ctx.tenantId,
      heads.map((h) => h.id),
    );
  }

  const matches = await deps.customers.search(ctx.tenantId, query, params.sort);
  // Um acompanhante resolve para o próprio responsável; um responsável, para si.
  const responsibleIds = [...new Set(matches.map((m) => m.responsibleId ?? m.id))];
  return familiesOf(deps, ctx.tenantId, responsibleIds);
}

async function familiesOf(
  deps: SearchCustomersDeps,
  tenantId: string,
  responsibleIds: readonly string[],
): Promise<Family[]> {
  const families: Family[] = [];
  for (const responsibleId of responsibleIds) {
    const responsible = await deps.customers.findById(tenantId, responsibleId);
    if (responsible) {
      const companions = await deps.customers.listByResponsible(tenantId, responsibleId);
      families.push({ responsible, companions });
    }
  }
  return families;
}
