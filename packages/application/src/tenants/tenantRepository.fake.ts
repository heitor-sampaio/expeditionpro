import type { CompanyInfo, CompanyPatch, CrewLead, TenantRepository } from './tenantRepository.js';

/** Fake in-memory do port de tenant. Excluído do build (`*.fake.ts`). */
export function fakeTenantRepository(
  seed: CompanyInfo = { name: 'Drakkar Expedições', cnpj: null, slug: 'drk', logo: null },
): TenantRepository & { company: CompanyInfo } {
  let company = seed;
  let crew: CrewLead | null = null;

  return {
    get company() {
      return company;
    },
    getCompanyInfo: () => Promise.resolve(company),
    findIdBySlug: (slug: string) => Promise.resolve(slug === company.slug ? 'tenant-a' : null),
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
