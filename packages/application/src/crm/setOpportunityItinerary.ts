import { actorUserId } from '../audit/auditLogRepository.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { requireWriter } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';
import type { OpportunityRecord, OpportunityRepository } from './opportunityRepository.js';

export interface SetOpportunityItineraryDeps {
  readonly opportunities: OpportunityRepository;
  readonly audit: AuditLogRepository;
  readonly itineraries: ItineraryRepository;
}

export interface SetOpportunityItineraryCommand {
  readonly opportunityId: string;
  /** `null` limpa: a conversa pode ter mudado de assunto. */
  readonly itineraryId: string | null;
}

/**
 * OP-03 — de qual **roteiro** é a conversa.
 *
 * Roteiro é o produto (Coxilha Rica), não a saída com data. A data raramente existe quando a
 * conversa começa — o §5.7.2 registra que nem o formulário público pergunta, para não dar ao
 * cliente um motivo de adiar. Amarrar a oportunidade a um grupo específico repetiria aqui o
 * atrito que aquela decisão evita lá.
 *
 * Continua **opcional**: metade das conversas começa em "vocês fazem alguma viagem em
 * outubro?", sem roteiro na cabeça de quem pergunta. Obrigar a escolher empurraria a equipe a
 * chutar, e chute vira relatório errado depois.
 *
 * `operator` muda: é trabalho do dia, como mover o cartão.
 */
export async function setOpportunityItinerary(
  deps: SetOpportunityItineraryDeps,
  ctx: RequestContext,
  command: SetOpportunityItineraryCommand,
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
      'Esta oportunidade virou inscrição: o roteiro agora é o da inscrição.',
    );
  }

  const anterior =
    oportunidade.itineraryId === null
      ? null
      : await deps.itineraries.findById(ctx.tenantId, oportunidade.itineraryId);

  let destino = null;
  if (command.itineraryId !== null) {
    destino = await deps.itineraries.findById(ctx.tenantId, command.itineraryId);
    // Roteiro de outro tenant e roteiro inexistente respondem igual: o `findById` já é
    // escopado, e distinguir confirmaria que o id existe em algum lugar.
    if (!destino) throw new NotFoundError('roteiro');
  }

  const atualizada = await deps.opportunities.updateOpportunity(ctx.tenantId, oportunidade.id, {
    itineraryId: command.itineraryId,
  });

  if (oportunidade.itineraryId !== command.itineraryId) {
    await deps.audit.record({
      tenantId: ctx.tenantId,
      actorUserId: actorUserId(ctx.actor),
      entity: 'opportunity',
      entityId: oportunidade.id,
      action: 'opportunity.set_itinerary',
      // Nome, não id: quem lê a trilha meses depois quer o roteiro, não a chave.
      diff: { itinerary: { from: anterior?.name ?? null, to: destino?.name ?? null } },
    });
  }

  return atualizada;
}
