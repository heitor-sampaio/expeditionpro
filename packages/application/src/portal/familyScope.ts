import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';

/**
 * Escopo de família para a escrita do cliente (§3.7 / PC-06 / PC-08). A defesa da RLS
 * é SELECT-only; a escrita passa aqui, no servidor. Equipe gerencia todo o tenant;
 * cliente só a própria família (mesmo "head"). Integração/sistema não gerenciam pessoa.
 */

/** Head da família: o responsável — ou o próprio cliente, se já é responsável. */
export async function familyHead(
  customers: CustomerRepository,
  tenantId: string,
  customerId: string,
): Promise<string | null> {
  const customer = await customers.findById(tenantId, customerId);
  if (!customer) return null;
  return customer.responsibleId ?? customer.id;
}

/** Autoriza o ator a gerenciar o cliente-alvo (PC-06/PC-08). */
export async function assertActorManagesCustomer(
  customers: CustomerRepository,
  ctx: RequestContext,
  targetCustomerId: string,
): Promise<void> {
  const { actor } = ctx;
  if (actor.kind === 'team') return; // back-office gerencia todo o tenant
  if (actor.kind !== 'customer') {
    throw new ForbiddenError('Ação restrita à equipe ou ao cliente');
  }
  const [mine, target] = await Promise.all([
    familyHead(customers, ctx.tenantId, actor.customerId),
    familyHead(customers, ctx.tenantId, targetCustomerId),
  ]);
  if (mine === null || target === null || mine !== target) {
    throw new ForbiddenError('Fora da sua família');
  }
}

/** Head da família do ator cliente — para criar acompanhante sob o responsável certo. */
export async function actorFamilyHead(
  customers: CustomerRepository,
  ctx: RequestContext,
): Promise<string> {
  if (ctx.actor.kind !== 'customer') {
    throw new ForbiddenError('Ação do portal exige um cliente autenticado');
  }
  const head = await familyHead(customers, ctx.tenantId, ctx.actor.customerId);
  if (head === null) throw new ForbiddenError('Cliente não encontrado');
  return head;
}
