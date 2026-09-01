import { requireWriter } from '../audience.js';
import { BusinessRuleError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { IntakeRepository } from './intakeRepository.js';

/**
 * IN-19 — descarta uma inscrição recebida, com motivo obrigatório. Só a equipe.
 * Não vira booking; sai da fila com o motivo registrado.
 */

export interface DiscardIntakeDeps {
  readonly intake: IntakeRepository;
}

export interface DiscardIntakeCommand {
  readonly intakeId: string;
  readonly reason: string;
}

export async function discardIntake(
  deps: DiscardIntakeDeps,
  ctx: RequestContext,
  command: DiscardIntakeCommand,
): Promise<void> {
  requireWriter(ctx);
  const reason = command.reason.trim();
  if (reason.length === 0) {
    throw new RequiredFieldError('motivo');
  }

  const intake = await deps.intake.findForAllocation(ctx.tenantId, command.intakeId);
  if (!intake) {
    throw new NotFoundError('inscrição recebida');
  }
  if (intake.status === 'allocated' || intake.status === 'discarded') {
    throw new BusinessRuleError('not_in_queue', 'Inscrição já saiu da fila');
  }

  await deps.intake.markDiscarded(ctx.tenantId, command.intakeId, reason);
}
