import { actorUserId } from '../audit/auditLogRepository.js';
import { requireWriter } from '../audience.js';
import { NotFoundError } from '../errors.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { OpportunityRepository } from '../crm/opportunityRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { ConversationRepository } from './conversationRepository.js';
import { comCliente, type ConversationView } from './listConversations.js';

export interface AttachConversationDeps {
  readonly conversations: ConversationRepository;
  readonly opportunities: OpportunityRepository;
  /** AT-06: toda conversa que sai daqui leva o cliente junto, quando ele existe. */
  readonly customers: CustomerRepository;
  readonly audit: AuditLogRepository;
}

export interface AttachConversationCommand {
  readonly conversationId: string;
  /** `null` desanexa: vincular na pessoa errada acontece, e desfazer precisa ser barato. */
  readonly opportunityId: string | null;
}

/**
 * AT-10 — a ponte entre a caixa e o funil.
 *
 * É o movimento que dá sentido às duas metades: alguém chamou no WhatsApp, a equipe abriu um
 * cartão, e a conversa fica pendurada nele. Sem essa ponte o funil vira digitação e a caixa vira
 * caixa de e-mail.
 *
 * A ligação é feita **à mão**, de propósito. O sistema casa a conversa com um cliente existente
 * pelo telefone quando não há dúvida nenhuma (AT-06), mas escolher a qual negociação ela pertence
 * é julgamento: a mesma pessoa pode ter duas oportunidades abertas.
 */
export async function attachConversationToOpportunity(
  deps: AttachConversationDeps,
  ctx: RequestContext,
  command: AttachConversationCommand,
): Promise<ConversationView> {
  requireWriter(ctx);

  const conversa = await deps.conversations.findConversationById(
    ctx.tenantId,
    command.conversationId,
  );
  if (!conversa) throw new NotFoundError('conversa');

  let destino = null;
  if (command.opportunityId !== null) {
    destino = await deps.opportunities.findOpportunityById(ctx.tenantId, command.opportunityId);
    // Oportunidade de outro tenant e inexistente respondem igual: o repositório já é escopado.
    if (!destino) throw new NotFoundError('oportunidade');
  }

  const anterior =
    conversa.opportunityId === null
      ? null
      : await deps.opportunities.findOpportunityById(ctx.tenantId, conversa.opportunityId);

  const atualizada = await deps.conversations.attachToOpportunity(
    ctx.tenantId,
    conversa.id,
    command.opportunityId,
  );

  if (conversa.opportunityId !== command.opportunityId) {
    await deps.audit.record({
      tenantId: ctx.tenantId,
      actorUserId: actorUserId(ctx.actor),
      entity: 'conversation',
      entityId: conversa.id,
      action: 'conversation.attach',
      // Nome do contato, não id: quem lê a trilha depois quer saber de quem era a conversa.
      diff: {
        opportunity: { from: anterior?.contactName ?? null, to: destino?.contactName ?? null },
      },
    });
  }

  const [comFicha] = await comCliente(deps, ctx.tenantId, [atualizada]);
  return comFicha!;
}
