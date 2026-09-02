import { actorUserId } from '../audit/auditLogRepository.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import type { RequestContext } from '../context.js';
import type { StageDeps } from './createStage.js';

export interface ArchiveStageCommand {
  readonly stageId: string;
}

/**
 * OP-06 — arquiva uma etapa, e **só se ela estiver vazia**.
 *
 * Sem esta trava, arquivar faria os cartões daquela coluna sumirem do quadro sem que ninguém
 * tivesse decidido descartá-los — e eles continuariam existindo no banco, invisíveis. É a
 * mesma regra da categoria de fornecedor (FO-05) pelo mesmo motivo: sumiço em silêncio é
 * sempre a resposta errada. O caminho é mover os cartões antes, que é reversível.
 *
 * Arquiva em vez de apagar porque a trilha de movimentação guarda o id da etapa: apagar
 * deixaria o histórico apontando para nada.
 */
export async function archiveStage(
  deps: StageDeps,
  ctx: RequestContext,
  command: ArchiveStageCommand,
): Promise<void> {
  requireTeamAdmin(ctx, 'Configurar o funil');

  const atual = await deps.opportunities.findStageById(ctx.tenantId, command.stageId);
  if (!atual) throw new NotFoundError('etapa');

  const dentro = await deps.opportunities.countOpportunitiesByStage(ctx.tenantId, atual.id);
  if (dentro > 0) {
    throw new BusinessRuleError(
      'stage_in_use',
      `${String(dentro)} oportunidade(s) estão nesta etapa. Mova antes de arquivar.`,
    );
  }

  await deps.opportunities.archiveStage(ctx.tenantId, atual.id);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'opportunity_stage',
    entityId: atual.id,
    action: 'opportunity_stage.archive',
    diff: { name: atual.name },
  });
}
