import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CompanyInfo, TenantRepository } from './tenantRepository.js';

/**
 * CF-01 — a identidade da empresa para a tela de Configurações e para a marca da
 * navegação: razão social, CNPJ e logo.
 *
 * Leitura de qualquer papel de equipe: a marca aparece para todo mundo que usa o
 * sistema, e esconder o nome da própria empresa de um operator não protege nada.
 */

export interface GetCompanyDeps {
  readonly tenants: TenantRepository;
}

export async function getCompany(deps: GetCompanyDeps, ctx: RequestContext): Promise<CompanyInfo> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A configuração da empresa é da equipe');
  }
  return deps.tenants.getCompanyInfo(ctx.tenantId);
}
