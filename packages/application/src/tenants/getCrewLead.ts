import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CrewLead, TenantRepository } from './tenantRepository.js';

/**
 * CF-05 — o condutor da empresa, para a aba Equipe e para os documentos da saída.
 *
 * Leitura da equipe: quem opera precisa saber quem abre o comboio. O cliente não lê —
 * é dado pessoal de quem trabalha na empresa, não do cliente (§3.7).
 */

export interface GetCrewLeadDeps {
  readonly tenants: TenantRepository;
}

export async function getCrewLead(
  deps: GetCrewLeadDeps,
  ctx: RequestContext,
): Promise<CrewLead | null> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A configuração da equipe é da equipe');
  }
  return deps.tenants.getCrewLead(ctx.tenantId);
}
