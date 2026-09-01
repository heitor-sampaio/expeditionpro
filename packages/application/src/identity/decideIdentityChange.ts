import { actorUserId } from '../audit/auditLogRepository.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import { parseCpf } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { DuplicateCpfError } from '../customers/errors.js';
import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type {
  IdentityChangeRepository,
  IdentityChangeRequestRecord,
} from './identityChangeRepository.js';

/**
 * PC-07 — a equipe decide um pedido de identidade. Aprovar aplica os campos ao cliente
 * (identidade define preço e nota, então a checagem de CPF único é refeita aqui, no ato
 * autoritário) e marca `approved`; recusar arquiva com nota. Só owner/admin — é gravidade
 * de dinheiro/nota. Age só em pedido `pending`.
 */

export interface DecideIdentityChangeDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLogRepository;
  readonly identityRequests: IdentityChangeRepository;
  readonly clock: () => Date;
}

export interface DecideIdentityChangeCommand {
  readonly requestId: string;
  readonly approve: boolean;
  readonly note?: string | undefined;
}

export async function decideIdentityChange(
  deps: DecideIdentityChangeDeps,
  ctx: RequestContext,
  command: DecideIdentityChangeCommand,
): Promise<IdentityChangeRequestRecord> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Decidir mudança de identidade exige owner ou admin');
  }

  const request = await deps.identityRequests.findById(ctx.tenantId, command.requestId);
  if (!request) throw new NotFoundError('pedido');
  if (request.status !== 'pending') {
    throw new BusinessRuleError('not_pending', 'Pedido já decidido');
  }

  if (command.approve) {
    const cpf = request.cpf ? parseCpf(request.cpf) : undefined;
    if (cpf) {
      const existing = await deps.customers.findByCpf(ctx.tenantId, cpf);
      if (existing && existing.id !== request.customerId) throw new DuplicateCpfError();
    }
    if (request.fullName || cpf || request.birthDate) {
      await deps.customers.updateIdentity(ctx.tenantId, request.customerId, {
        ...(request.fullName ? { fullName: request.fullName } : {}),
        ...(cpf ? { cpf } : {}),
        ...(request.birthDate ? { birthDate: request.birthDate } : {}),
      });
    }
    // IN-04: o pedido pode trazer contato (telefone/e-mail) além de identidade.
    if (request.email !== null || request.phone !== null) {
      await deps.customers.updateContactInfo(ctx.tenantId, request.customerId, {
        ...(request.email !== null ? { email: request.email } : {}),
        ...(request.phone !== null ? { phone: request.phone } : {}),
      });
    }
  }

  const decided = await deps.identityRequests.decide(ctx.tenantId, command.requestId, {
    status: command.approve ? 'approved' : 'rejected',
    decidedBy: actor.userId,
    decidedAt: deps.clock(),
    decisionNote: command.note?.trim() || null,
  });

  /*
   * A09 — `updateCustomer` já gravava quando a equipe corrige identidade pelo back-office,
   * mas **este** é o caminho por onde a mudança acontece quando o pedido vem do cliente
   * (PC-07). Aprovar e recusar são igualmente auditáveis: negar também é decisão, e é a que
   * o cliente vai questionar.
   */
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'identity_change_request',
    entityId: request.id,
    action: 'identity_change.decide',
    diff: {
      decision: command.approve ? 'approved' : 'rejected',
      customerId: request.customerId,
      fullName: request.fullName,
      cpf: request.cpf,
      birthDate: request.birthDate,
    },
  });

  return decided;
}
