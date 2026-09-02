import { actorUserId } from '../audit/auditLogRepository.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { requireWriter } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { StageDeps } from './createStage.js';
import type { OpportunityRecord } from './opportunityRepository.js';

export interface MoveOpportunityCommand {
  readonly opportunityId: string;
  readonly stageId: string;
  /** OP-07: obrigatório quando a etapa de destino é de perda. */
  readonly lostReason?: string | undefined;
}

/**
 * OP-05 · OP-07 — move um cartão entre etapas.
 *
 * `operator` move: é o trabalho do dia. Quem desenha o funil é owner/admin (OP-01).
 *
 * Duas recusas sustentam o resto do modelo:
 *
 * - **Ganho não se alcança arrastando.** Fechar gera a inscrição (OP-08), e um cartão parado
 *   em "Fechado" sem inscrição nenhuma seria uma venda que o financeiro não conhece — o §1 é
 *   explícito sobre quem manda quando funil e ledger discordam.
 * - **Perda exige motivo.** Perda sem motivo é dado que não ensina nada depois, e o funil só
 *   se paga se disser por que as vendas morrem.
 *
 * Mover para a mesma etapa não gera linha na trilha: trilha com ruído não é lida.
 */
export async function moveOpportunity(
  deps: StageDeps,
  ctx: RequestContext,
  command: MoveOpportunityCommand,
): Promise<OpportunityRecord> {
  requireWriter(ctx);

  const oportunidade = await deps.opportunities.findOpportunityById(
    ctx.tenantId,
    command.opportunityId,
  );
  if (!oportunidade) throw new NotFoundError('oportunidade');

  if (oportunidade.bookingId !== null) {
    throw new BusinessRuleError(
      'opportunity_closed',
      'Esta oportunidade virou inscrição e não se move mais.',
    );
  }

  // Etapa arquivada não aparece em `listStages`: destino inexistente e destino aposentado
  // respondem igual, e é o certo — as duas coisas são "não pode ir para lá".
  const etapas = await deps.opportunities.listStages(ctx.tenantId);
  const destino = etapas.find((s) => s.id === command.stageId);
  if (!destino) throw new NotFoundError('etapa');

  if (destino.kind === 'won') {
    throw new BusinessRuleError(
      'use_conversion',
      'Fechar cria a inscrição: use "Fechar negócio" em vez de mover o cartão para cá.',
    );
  }

  const motivo = command.lostReason?.trim();
  if (destino.kind === 'lost' && !motivo) {
    throw new BusinessRuleError('lost_reason_required', 'Perder exige o motivo.');
  }

  const origem = await deps.opportunities.findStageById(ctx.tenantId, oportunidade.stageId);
  if (destino.id === oportunidade.stageId) return oportunidade;

  const movida = await deps.opportunities.updateOpportunity(ctx.tenantId, oportunidade.id, {
    stageId: destino.id,
    ...(destino.kind === 'lost' ? { lostReason: motivo ?? null } : {}),
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'opportunity',
    entityId: oportunidade.id,
    action: 'opportunity.move',
    diff: {
      // Nome, não id: quem lê a trilha meses depois quer saber a etapa, não a chave.
      stage: { from: origem?.name ?? oportunidade.stageId, to: destino.name },
      ...(destino.kind === 'lost' ? { lostReason: motivo } : {}),
    },
  });

  return movida;
}
