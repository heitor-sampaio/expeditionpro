import { parseCpf, parseLocalDate } from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { DuplicateCpfError } from '../customers/errors.js';
import { assertActorManagesCustomer } from '../portal/familyScope.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type {
  IdentityChangeRepository,
  IdentityChangeRequestRecord,
} from './identityChangeRepository.js';

/**
 * PC-07 — pede uma mudança de identidade (nome/CPF/nascimento). Não aplica nada: cria
 * o pedido `pending` para a equipe decidir. Escopo de família (cliente pede só para a
 * própria família). Valida formato de CPF e unicidade já aqui, para feedback rápido; a
 * checagem autoritária de unicidade é refeita na aprovação.
 */

export interface RequestIdentityChangeDeps {
  readonly customers: CustomerRepository;
  readonly identityRequests: IdentityChangeRepository;
}

export interface RequestIdentityChangeCommand {
  readonly customerId: string;
  readonly fullName?: string | undefined;
  readonly cpf?: string | undefined;
  readonly birthDate?: string | undefined; // ISO YYYY-MM-DD
  readonly reason?: string | undefined;
}

export async function requestIdentityChange(
  deps: RequestIdentityChangeDeps,
  ctx: RequestContext,
  command: RequestIdentityChangeCommand,
): Promise<IdentityChangeRequestRecord> {
  await assertActorManagesCustomer(deps.customers, ctx, command.customerId);

  const target = await deps.customers.findById(ctx.tenantId, command.customerId);
  if (!target) throw new NotFoundError('cliente');

  const fullName = command.fullName?.trim() || undefined;
  const cpf = command.cpf ? parseCpf(command.cpf) : undefined;
  const birthDate = command.birthDate ? parseLocalDate(command.birthDate) : undefined;

  if (!fullName && !cpf && !birthDate) {
    throw new BusinessRuleError('no_identity_change', 'Informe ao menos nome, CPF ou nascimento');
  }
  if (cpf) {
    const existing = await deps.customers.findByCpf(ctx.tenantId, cpf);
    if (existing && existing.id !== command.customerId) throw new DuplicateCpfError();
  }

  return deps.identityRequests.create({
    tenantId: ctx.tenantId,
    customerId: command.customerId,
    requestedBy: 'userId' in ctx.actor ? ctx.actor.userId : null,
    fullName: fullName ?? null,
    cpf: cpf ?? null,
    birthDate: birthDate ?? null,
    email: null,
    phone: null,
    reason: command.reason?.trim() || null,
  });
}
