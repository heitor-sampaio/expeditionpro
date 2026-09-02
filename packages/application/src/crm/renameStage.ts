import { actorUserId } from '../audit/auditLogRepository.js';
import { BusinessRuleError, NotFoundError, RequiredFieldError } from '../errors.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import type { RequestContext } from '../context.js';
import type { StageDeps } from './createStage.js';
import type { OpportunityStageRecord } from './opportunityRepository.js';

export interface RenameStageCommand {
  readonly stageId: string;
  readonly name: string;
}

/**
 * OP-01 — renomeia uma etapa, preservando posição e cartões.
 *
 * Renomear alcança o histórico: a trilha de movimentação (OP-05) guarda o id da etapa, então
 * o registro antigo passa a ser lido com o nome novo. É o mesmo comportamento — e a mesma
 * escolha deliberada — da categoria de fornecedor (FO-04): quando alguém percebe que o nome
 * estava errado, quer o nome certo desde o começo.
 */
export async function renameStage(
  deps: StageDeps,
  ctx: RequestContext,
  command: RenameStageCommand,
): Promise<OpportunityStageRecord> {
  requireTeamAdmin(ctx, 'Configurar o funil');

  const name = command.name.trim();
  if (name === '') throw new RequiredFieldError('nome');

  const atual = await deps.opportunities.findStageById(ctx.tenantId, command.stageId);
  if (!atual) throw new NotFoundError('etapa');

  const existente = await deps.opportunities.findStageByName(ctx.tenantId, name);
  if (existente && existente.id !== atual.id) {
    throw new BusinessRuleError(
      'duplicate_stage',
      `Já existe uma etapa chamada "${existente.name}"`,
    );
  }

  const renomeada = await deps.opportunities.renameStage(ctx.tenantId, atual.id, name);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'opportunity_stage',
    entityId: atual.id,
    action: 'opportunity_stage.rename',
    diff: { name: { from: atual.name, to: name } },
  });

  return renomeada;
}
