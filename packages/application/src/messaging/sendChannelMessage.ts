import { requireWriter } from '../audience.js';
import { BusinessRuleError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { ChannelIntegrationRepository } from './channelIntegrationRepository.js';
import type { ConversationRepository, MessageRecord } from './conversationRepository.js';
import type { MessagingGateway } from './messagingGateway.js';

export interface SendChannelMessageDeps {
  readonly conversations: ConversationRepository;
  readonly integrations: ChannelIntegrationRepository;
  readonly gateway: MessagingGateway;
  readonly clock: () => Date;
}

export interface SendChannelMessageCommand {
  readonly conversationId: string;
  readonly body: string;
}

/**
 * AT-08 — responder pela caixa.
 *
 * A ordem importa: **manda primeiro, grava depois**. O contrário deixaria no fio uma resposta
 * que o cliente nunca recebeu — numa caixa de atendimento esse é o pior erro possível, porque
 * a equipe passa a acreditar que respondeu.
 *
 * O preço da ordem escolhida é o oposto: se o provedor aceitar e a gravação falhar, a mensagem
 * saiu e não aparece aqui. Some do fio, mas o eco do provedor (AT-03) a traz de volta na
 * chegada — a mesma marca de idempotência que impede a duplicata cobre esse buraco.
 *
 * `sentByUserId` é o que a caixa compartilhada tem no lugar do dono da conversa: sem ele, não
 * há como saber quem falou com o cliente.
 */
export async function sendChannelMessage(
  deps: SendChannelMessageDeps,
  ctx: RequestContext,
  command: SendChannelMessageCommand,
): Promise<MessageRecord> {
  requireWriter(ctx);

  const body = command.body.trim();
  if (body === '') throw new RequiredFieldError('mensagem');

  const conversa = await deps.conversations.findConversationById(
    ctx.tenantId,
    command.conversationId,
  );
  if (!conversa) throw new NotFoundError('conversa');

  const integration = await deps.integrations.findByChannel(ctx.tenantId, conversa.channel);
  if (!integration?.active) {
    throw new BusinessRuleError(
      'channel_not_connected',
      'O canal desta conversa não está conectado. Reconecte em Configurações → Integrações.',
    );
  }

  const enviado = await deps.gateway.sendText({
    integration,
    to: conversa.channelUserId,
    text: body,
  });
  if (!enviado.ok) {
    // O motivo do provedor sobe junto: sem ele a tela diz "não foi possível enviar" e não há
    // o que fazer com isso. É a diferença entre "número não existe" e "instância desconectada".
    throw new BusinessRuleError('send_failed', enviado.detail);
  }

  const sentAt = deps.clock();
  const mensagem = await deps.conversations.addMessage({
    tenantId: ctx.tenantId,
    conversationId: conversa.id,
    externalId: enviado.externalId,
    direction: 'out',
    body,
    sentByUserId: ctx.actor.userId,
    // Sem corpo cru: esta mensagem nasceu aqui, não veio de webhook nenhum.
    payload: {},
    sentAt,
  });

  await deps.conversations.touchConversation(ctx.tenantId, conversa.id, {
    lastMessageAt: sentAt,
    // O que sai já foi visto por quem escreveu.
    incrementUnread: false,
  });

  return mensagem;
}
