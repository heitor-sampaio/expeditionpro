import { ForbiddenError } from '../errors.js';
import { actorFamilyHead } from './familyScope.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { IntakeRepository, PortalRequestRecord } from '../intake/intakeRepository.js';

/**
 * §5.8 — os pedidos de inscrição do cliente que ainda aguardam a revisão da equipe. Sem
 * isto o cliente pede e não vê nada: a inscrição só existe depois da alocação.
 *
 * Escopo de família pelo head, e a busca é feita **no servidor** — `intake_events` é tabela
 * de operação e a RLS não abre nada dela para o cliente.
 */

export interface ListEnrollmentRequestsDeps {
  readonly customers: CustomerRepository;
  readonly intake: IntakeRepository;
}

export async function listEnrollmentRequests(
  deps: ListEnrollmentRequestsDeps,
  ctx: RequestContext,
): Promise<PortalRequestRecord[]> {
  if (ctx.actor.kind !== 'customer') {
    throw new ForbiddenError('Leitura do portal');
  }
  const head = await actorFamilyHead(deps.customers, ctx);
  return deps.intake.listPortalRequestsByHead(ctx.tenantId, head);
}
