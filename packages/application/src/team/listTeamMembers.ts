import { requireTeamAdmin } from './teamGuards.js';
import type { RequestContext } from '../context.js';
import type { MembershipRecord, MembershipRepository } from './membershipRepository.js';

export interface TeamAccessDeps {
  readonly memberships: MembershipRepository;
}

/**
 * SEC-17 — quem tem acesso ao sistema e com que papel.
 *
 * Exige owner ou admin, como convidar. Saber quem entra no sistema, com que papel e desde
 * quando é informação de administração: para um operator ela não muda nenhuma decisão do
 * trabalho dele, e é o mapa de quem vale a pena atacar.
 */
export async function listTeamMembers(
  deps: TeamAccessDeps,
  ctx: RequestContext,
): Promise<readonly MembershipRecord[]> {
  requireTeamAdmin(ctx, 'Ver quem tem acesso');
  return deps.memberships.list(ctx.tenantId);
}
