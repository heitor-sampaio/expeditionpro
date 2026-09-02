import { parsePhone, type Cents } from '@expedition/domain';
import { actorUserId } from '../audit/auditLogRepository.js';
import { BusinessRuleError, RequiredFieldError } from '../errors.js';
import { requireWriter } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { StageDeps } from './createStage.js';
import type { OpportunityRecord, OpportunitySource } from './opportunityRepository.js';

export interface CreateOpportunityCommand {
  readonly contactName: string;
  readonly phone?: string | undefined;
  readonly email?: string | undefined;
  readonly itineraryId?: string | undefined;
  readonly customerId?: string | undefined;
  readonly expectedValueCents?: Cents | undefined;
  readonly source?: OpportunitySource | undefined;
}

/**
 * OP-03 · OP-04 — cria uma oportunidade. Exige **nome e mais nada**.
 *
 * Pedir CPF aqui repetiria no funil o erro que o §3.2 evita no formulário: atrito onde ainda
 * não há compromisso. Quem manda "quanto custa a Coxilha Rica?" não para para digitar
 * documento, e perder esse contato é justamente o que o funil existe para impedir. O CPF é
 * pedido no fechamento (OP-08), quando existe compromisso que o justifique.
 *
 * O cartão nasce na **primeira etapa do funil**, seja qual for o nome que o tenant deu a ela —
 * o código não conhece "Novo", conhece posição.
 */
export async function createOpportunity(
  deps: StageDeps,
  ctx: RequestContext,
  command: CreateOpportunityCommand,
): Promise<OpportunityRecord> {
  requireWriter(ctx);

  const contactName = command.contactName.trim();
  if (contactName === '') throw new RequiredFieldError('nome do contato');

  const etapas = await deps.opportunities.listStages(ctx.tenantId);
  const primeira = etapas[0];
  if (!primeira) {
    throw new BusinessRuleError(
      'no_stages',
      'O funil não tem nenhuma etapa. Configure as etapas antes de criar oportunidades.',
    );
  }

  // Telefone normalizado na borda, como no resto do sistema: guardado em E.164, formatado na
  // leitura. Inválido é recusado em vez de virar texto solto que ninguém consegue discar.
  const phone = command.phone?.trim() ? parsePhone(command.phone) : null;

  const oportunidade = await deps.opportunities.createOpportunity({
    tenantId: ctx.tenantId,
    stageId: primeira.id,
    contactName,
    phone,
    email: command.email?.trim() || null,
    itineraryId: command.itineraryId ?? null,
    customerId: command.customerId ?? null,
    expectedValueCents: command.expectedValueCents ?? null,
    source: command.source ?? 'manual',
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'opportunity',
    entityId: oportunidade.id,
    action: 'opportunity.create',
    diff: { contactName, source: oportunidade.source, stage: primeira.name },
  });

  return oportunidade;
}
