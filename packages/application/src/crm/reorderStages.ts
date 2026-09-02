import { actorUserId } from '../audit/auditLogRepository.js';
import { BusinessRuleError } from '../errors.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import type { RequestContext } from '../context.js';
import type { StageDeps } from './createStage.js';

export interface ReorderStagesCommand {
  readonly orderedStageIds: readonly string[];
}

/**
 * OP-01 — reordena as colunas do funil.
 *
 * Exige a **lista completa**, não um movimento ("mova a etapa X para a posição 2"). Posição é
 * única por tenant, e mover uma etapa por vez passaria por estados em que duas ocupam a mesma
 * posição — o banco recusaria no meio, deixando a ordem pela metade. Recebendo tudo, a
 * gravação é uma transação só e não existe passo intermediário inválido.
 *
 * Lista parcial é recusada pelo mesmo motivo: o que ficou de fora manteria a posição antiga e
 * colidiria com alguém.
 */
export async function reorderStages(
  deps: StageDeps,
  ctx: RequestContext,
  command: ReorderStagesCommand,
): Promise<void> {
  requireTeamAdmin(ctx, 'Configurar o funil');

  const atuais = await deps.opportunities.listStages(ctx.tenantId);
  const esperados = new Set(atuais.map((s) => s.id));
  const recebidos = new Set(command.orderedStageIds);

  const completa =
    recebidos.size === command.orderedStageIds.length &&
    esperados.size === recebidos.size &&
    [...esperados].every((id) => recebidos.has(id));

  if (!completa) {
    throw new BusinessRuleError(
      'incomplete_stage_order',
      'A nova ordem precisa citar todas as etapas ativas, uma única vez cada.',
    );
  }

  await deps.opportunities.reorderStages(ctx.tenantId, command.orderedStageIds);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'opportunity_stage',
    // A ordem é do funil inteiro, não de uma etapa: a entidade é o tenant.
    entityId: ctx.tenantId,
    action: 'opportunity_stage.reorder',
    diff: {
      from: atuais.map((s) => s.name),
      to: command.orderedStageIds.map((id) => atuais.find((s) => s.id === id)?.name ?? id),
    },
  });
}
