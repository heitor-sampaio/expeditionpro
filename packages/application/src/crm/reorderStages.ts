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
 * Exige a **lista completa**, não um movimento ("mova a etapa X para a posição 2").
 *
 * `position` não tem unique no banco de propósito — etapa arquivada guarda a posição dela, e
 * um unique impediria a ativa seguinte de ocupar aquele número. O preço disso é que nada
 * impede duas etapas na mesma posição, e é exatamente por isso que a reordenação recebe a
 * ordem inteira: recebendo a lista, as posições são reescritas de 0 a n-1 numa transação só e
 * o resultado é sempre coerente. Um movimento isolado deixaria buraco ou empate, e a ordem do
 * quadro passaria a depender do desempate por nome — ordem que ninguém pediu.
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
