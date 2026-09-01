import { BusinessRuleError, ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { GroupRecord, ScheduleRepository } from './scheduleRepository.js';

/**
 * AG-05 — cancela a saída. É o caminho de quem já teve lançamento: o grupo sai da
 * vitrine e da auto-inscrição, mas **não some** — a agenda continua mostrando que
 * aquela data existiu e foi cancelada.
 *
 * O cancelamento **não toca em inscrição nem em dinheiro**: devolução e cashback são
 * avaliados caso a caso pela equipe (decisão do dono do produto). O motivo é obrigatório
 * e vai para a trilha — cancelar uma saída afeta famílias que já pagaram, então exige
 * owner/admin, o mesmo peso das outras decisões irreversíveis.
 */

export interface CancelGroupCommand {
  readonly groupId: string;
  readonly reason: string;
}

export interface CancelGroupDeps {
  readonly schedule: ScheduleRepository;
  readonly audit: AuditLogRepository;
}

export async function cancelGroup(
  deps: CancelGroupDeps,
  ctx: RequestContext,
  command: CancelGroupCommand,
): Promise<GroupRecord> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Cancelar a saída exige owner ou admin');
  }

  const reason = command.reason.trim();
  if (reason.length === 0) throw new RequiredFieldError('reason');

  const found = await deps.schedule.findGroupById(ctx.tenantId, command.groupId);
  if (!found) throw new NotFoundError('grupo');
  if (found.group.status === 'cancelled') {
    throw new BusinessRuleError('already_cancelled', 'Esta saída já está cancelada');
  }

  const cancelled = await deps.schedule.updateGroupStatus(
    ctx.tenantId,
    found.group.id,
    'cancelled',
  );
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'group',
    entityId: found.group.id,
    action: 'group.cancel',
    diff: { from: found.group.status, reason },
  });
  return cancelled;
}
