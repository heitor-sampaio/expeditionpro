import { actorFamilyHead } from './familyScope.js';
import type { LocalDate } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';

/**
 * §3.7 — a família do cliente autenticado (o responsável + os acompanhantes sob ele), para
 * o portal montar o seletor de "quem vai" na auto-inscrição (§5.8). Só a própria família.
 */

export interface FamilyMember {
  readonly id: string;
  readonly fullName: string;
  readonly birthDate: LocalDate;
  readonly email: string | null;
  readonly phone: string | null;
  readonly role: 'responsible' | 'companion';
}

export interface ListPortalFamilyDeps {
  readonly customers: CustomerRepository;
}

export async function listPortalFamily(
  deps: ListPortalFamilyDeps,
  ctx: RequestContext,
): Promise<FamilyMember[]> {
  const head = await actorFamilyHead(deps.customers, ctx); // exige um cliente autenticado
  const [headRecord, companions] = await Promise.all([
    deps.customers.findById(ctx.tenantId, head),
    deps.customers.listByResponsible(ctx.tenantId, head),
  ]);
  const members = headRecord ? [headRecord, ...companions] : companions;
  return members.map((m) => ({
    id: m.id,
    fullName: m.fullName,
    birthDate: m.birthDate,
    email: m.email,
    phone: m.phone,
    role: m.responsibleId === null ? 'responsible' : 'companion',
  }));
}
