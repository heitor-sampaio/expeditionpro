import { requireTeam } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { ConversationRecord, ConversationRepository } from './conversationRepository.js';

export interface InboxDeps {
  readonly conversations: ConversationRepository;
}

/**
 * AT-07 — a caixa é **compartilhada**: toda a equipe vê e responde qualquer conversa.
 *
 * Não há conversa "de alguém". Numa operação deste tamanho, conversa parada porque o dono dela
 * está na estrada é pior problema que conversa sem dono; o que a caixa compartilhada troca pela
 * atribuição é o registro de quem respondeu, que fica em cada mensagem (AT-08).
 *
 * `viewer` lê — somente leitura não é cegueira. Cliente não chega aqui: o portal não tem chat
 * (AT-11), e a RLS diz o mesmo do outro lado.
 */
export async function listConversations(
  deps: InboxDeps,
  ctx: RequestContext,
): Promise<ConversationRecord[]> {
  requireTeam(ctx);
  return deps.conversations.listConversations(ctx.tenantId);
}
