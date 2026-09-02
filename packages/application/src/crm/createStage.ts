import { actorUserId, type AuditLogRepository } from '../audit/auditLogRepository.js';
import { BusinessRuleError, RequiredFieldError } from '../errors.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import type { RequestContext } from '../context.js';
import type {
  OpportunityRepository,
  OpportunityStageRecord,
  StageKind,
} from './opportunityRepository.js';

export interface StageDeps {
  readonly opportunities: OpportunityRepository;
  readonly audit: AuditLogRepository;
}

export interface CreateStageCommand {
  readonly name: string;
  readonly kind: StageKind;
}

/**
 * OP-01 — cria uma etapa do funil, no fim.
 *
 * Configurar o funil é desenhar como a empresa vende, não trabalho do dia: exige owner ou
 * admin, como renomear categoria de fornecedor (FO-05). Quem move cartão é `operator`; quem
 * decide que colunas existem, não.
 *
 * Nome repetido é recusado porque duas colunas com o mesmo nome no quadro não distinguem
 * nada — quem arrasta um cartão para "Proposta" não saberia para qual das duas foi.
 */
export async function createStage(
  deps: StageDeps,
  ctx: RequestContext,
  command: CreateStageCommand,
): Promise<OpportunityStageRecord> {
  requireTeamAdmin(ctx, 'Configurar o funil');

  const name = command.name.trim();
  if (name === '') throw new RequiredFieldError('nome');

  const existente = await deps.opportunities.findStageByName(ctx.tenantId, name);
  if (existente) {
    throw new BusinessRuleError(
      'duplicate_stage',
      `Já existe uma etapa chamada "${existente.name}"`,
    );
  }

  const atuais = await deps.opportunities.listStages(ctx.tenantId);
  const position = atuais.length === 0 ? 0 : Math.max(...atuais.map((s) => s.position)) + 1;

  const stage = await deps.opportunities.createStage({
    tenantId: ctx.tenantId,
    name,
    position,
    kind: command.kind,
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'opportunity_stage',
    entityId: stage.id,
    action: 'opportunity_stage.create',
    diff: { name: stage.name, kind: stage.kind },
  });

  return stage;
}
