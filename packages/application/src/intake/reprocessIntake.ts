import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { describeProcessingError } from './intakeProcessingError.js';
import { resolveIntakeProfile } from './intakeProfiles.js';
import type { RequestContext } from '../context.js';
import type { IntakeRepository } from './intakeRepository.js';

/**
 * IN-05 — o botão de reprocessar. Reaplica o perfil de mapeamento sobre o **corpo cru
 * preservado** de uma inscrição em `error`. Sucesso → volta para a fila
 * (`needs_allocation`) com o normalizado e limpa o erro. Ainda falha → segue em `error`
 * com a mensagem atualizada, e relança (422) para a equipe ver o campo culpado.
 *
 * Só a equipe reprocessa, e só o que está em `error` (o resto da fila não é reprocessável).
 * Reprocessar o mesmo payload só muda o resultado se a causa mudou fora dele — perfil de
 * mapeamento corrigido, config que passou a existir. Sem isso, o valor é a visibilidade:
 * a inscrição não se perde e a equipe pode retomá-la.
 */

export interface ReprocessIntakeDeps {
  readonly intake: IntakeRepository;
}

export interface ReprocessIntakeCommand {
  readonly intakeId: string;
}

export interface ReprocessedIntake {
  readonly intakeId: string;
  readonly status: 'queued';
}

export async function reprocessIntake(
  deps: ReprocessIntakeDeps,
  ctx: RequestContext,
  command: ReprocessIntakeCommand,
): Promise<ReprocessedIntake> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Reprocessar é feito pela equipe');
  }

  const row = await deps.intake.findForReprocess(ctx.tenantId, command.intakeId);
  if (!row) {
    throw new NotFoundError('inscrição recebida');
  }
  if (row.status !== 'error') {
    throw new BusinessRuleError('not_reprocessable', 'Só reprocessa inscrição em erro');
  }

  const profile = resolveIntakeProfile(row.source);
  if (!profile) {
    throw new BusinessRuleError('unsupported_source', `Perfil não suportado: ${row.source}`);
  }

  let mapped;
  try {
    mapped = profile.map(row.payload);
  } catch (error) {
    await deps.intake.markError(ctx.tenantId, command.intakeId, describeProcessingError(error));
    throw error;
  }

  await deps.intake.markReprocessed(ctx.tenantId, command.intakeId, {
    normalized: mapped,
    formId: mapped.formId,
    submittedAt: mapped.submitted,
  });

  return { intakeId: command.intakeId, status: 'queued' };
}
