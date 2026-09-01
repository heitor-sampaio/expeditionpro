import type {
  CompanyInfo,
  CompanyPatch,
  CrewLead,
  TenantRepository,
} from '@expedition/application';

/** Tenant em memória — SÓ para dev sem banco e testes de rota. */
export function inMemoryTenants(
  seed: CompanyInfo = { name: 'Drakkar Expedições', cnpj: null, slug: 'drk', logo: null },
): TenantRepository {
  let company = seed;
  let crew: CrewLead | null = null;

  return {
    getCompanyInfo: () => Promise.resolve(company),
    findIdBySlug: (slug: string) => Promise.resolve(slug === 'dev' ? 'dev-tenant' : null),
    saveCompany(_tenantId: string, patch: CompanyPatch) {
      company = {
        ...company,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.cnpj === undefined ? {} : { cnpj: patch.cnpj }),
        ...(patch.logo === undefined ? {} : { logo: patch.logo }),
      };
      return Promise.resolve(company);
    },
    getCrewLead: () => Promise.resolve(crew),
    saveCrewLead(_tenantId: string, lead: CrewLead | null) {
      crew = lead;
      return Promise.resolve(crew);
    },
  };
}
