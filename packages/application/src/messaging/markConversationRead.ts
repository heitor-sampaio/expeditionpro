import { requireWriter } from '../audience.js';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { InboxDeps } from './listConversations.js';

export interface MarkConversationReadCommand {
  readonly conversationId: string;
}

/**
 * AT-07 — zera o não lido da conversa.
 *
 * Exige `writer` e não só `team` porque numa caixa compartilhada o contador não é de quem olha:
 * é o sinal de "ninguém respondeu isto ainda", para todo mundo. Um `viewer` abrindo a caixa para
 * acompanhar apagaria esse sinal de quem vai responder.
 */
export async function markConversationRead(
  deps: InboxDeps,
  ctx: RequestContext,
  command: MarkConversationReadCommand,
): Promise<void> {
  requireWriter(ctx);

  const conversa = await deps.conversations.findConversationById(
    ctx.tenantId,
    command.conversationId,
  );
  if (!conversa) throw new NotFoundError('conversa');

  await deps.conversations.markRead(ctx.tenantId, conversa.id);
}
