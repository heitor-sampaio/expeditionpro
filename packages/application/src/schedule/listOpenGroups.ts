import type { OpenGroup, ScheduleRepository } from './scheduleRepository.js';

/**
 * IN-24 — vitrine pública: grupos abertos e públicos de um tenant, por slug. Sem
 * autenticação (a borda restringe por CORS aos domínios do tenant) e sem nada sensível.
 */

export interface ListOpenGroupsDeps {
  readonly schedule: ScheduleRepository;
}

export async function listOpenGroups(
  deps: ListOpenGroupsDeps,
  tenantSlug: string,
): Promise<OpenGroup[]> {
  return deps.schedule.listOpenGroupsBySlug(tenantSlug);
}
