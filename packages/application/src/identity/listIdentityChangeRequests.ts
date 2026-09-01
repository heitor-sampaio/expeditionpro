import { ForbiddenError } from '../errors.js';
import type { LocalDate } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type {
  IdentityChangeRepository,
  IdentityChangeRequestRecord,
} from './identityChangeRepository.js';

/**
 * PC-07 — a fila de pendentes para a equipe revisar. Enriquece cada pedido com o nome
 * do cliente e os valores **atuais** (para o revisor ver o de→para). É da equipe.
 */

export interface ListIdentityChangeRequestsDeps {
  readonly customers: CustomerRepository;
  readonly identityRequests: IdentityChangeRepository;
}

export interface EnrichedIdentityRequest {
  readonly request: IdentityChangeRequestRecord;
  readonly customerName: string;
  readonly currentFullName: string;
  readonly currentCpf: string | null;
  readonly currentBirthDate: LocalDate | null;
  readonly currentEmail: string | null;
  readonly currentPhone: string | null;
}

export async function listIdentityChangeRequests(
  deps: ListIdentityChangeRequestsDeps,
  ctx: RequestContext,
): Promise<EnrichedIdentityRequest[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A fila de identidade é da equipe');
  }
  const rows = await deps.identityRequests.listPending(ctx.tenantId);
  return Promise.all(
    rows.map(async (request) => {
      const customer = await deps.customers.findById(ctx.tenantId, request.customerId);
      return {
        request,
        customerName: customer?.fullName ?? '—',
        currentFullName: customer?.fullName ?? '—',
        currentCpf: customer?.cpf ?? null,
        currentBirthDate: customer?.birthDate ?? null,
        currentEmail: customer?.email ?? null,
        currentPhone: customer?.phone ?? null,
      };
    }),
  );
}
