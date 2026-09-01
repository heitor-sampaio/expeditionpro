import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CustomerRecord, CustomerRepository } from './customerRepository.js';

/**
 * CL-06 — a família com os dados completos, para a equipe editar a ficha no back-office
 * (`updateCustomer`). O portal tem a própria leitura (`listPortalFamily`, com CPF
 * mascarado e escopo de família), então aqui é leitura de equipe e ponto.
 *
 * Resolve pelo "head": entrar pelo acompanhante devolve a mesma família (CL-11, dois níveis).
 */

export interface CustomerFamilyView {
  readonly responsible: CustomerRecord;
  readonly companions: readonly CustomerRecord[];
}

export interface GetCustomerFamilyDeps {
  readonly customers: CustomerRepository;
}

export interface GetCustomerFamilyCommand {
  readonly customerId: string;
}

export async function getCustomerFamily(
  deps: GetCustomerFamilyDeps,
  ctx: RequestContext,
  command: GetCustomerFamilyCommand,
): Promise<CustomerFamilyView> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Leitura de equipe');
  }

  const customer = await deps.customers.findById(ctx.tenantId, command.customerId);
  if (!customer) throw new NotFoundError('cliente');

  const head =
    customer.responsibleId === null
      ? customer
      : await deps.customers.findById(ctx.tenantId, customer.responsibleId);
  if (!head) throw new NotFoundError('responsável');

  const companions = await deps.customers.listByResponsible(ctx.tenantId, head.id);
  return { responsible: head, companions };
}
