import { requireTeam } from '../audience.js';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ConversationRecord, MessageRecord } from './conversationRepository.js';
import type { InboxDeps } from './listConversations.js';

export interface ConversationThread {
  readonly conversation: ConversationRecord;
  readonly messages: readonly MessageRecord[];
}

export interface GetConversationCommand {
  readonly conversationId: string;
}

/**
 * AT-07 — o fio inteiro, do primeiro "oi" à última resposta, em ordem cronológica.
 *
 * Sem paginação por enquanto: uma conversa de venda tem dezenas de mensagens, não milhares, e
 * paginar antes de doer é abstração especulativa. Quando doer, entra por data.
 */
export async function getConversation(
  deps: InboxDeps,
  ctx: RequestContext,
  command: GetConversationCommand,
): Promise<ConversationThread> {
  requireTeam(ctx);

  const conversation = await deps.conversations.findConversationById(
    ctx.tenantId,
    command.conversationId,
  );
  // Conversa de outro tenant e conversa inexistente respondem igual — o repositório já é
  // escopado, e distinguir confirmaria que o id existe em algum lugar.
  if (!conversation) throw new NotFoundError('conversa');

  return {
    conversation,
    messages: await deps.conversations.listMessages(ctx.tenantId, conversation.id),
  };
}
