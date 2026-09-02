import type {
  Channel,
  ChannelIntegrationRecord,
  ChannelIntegrationRepository,
  ConversationRecord,
  ConversationRepository,
  MessageRecord,
  NewChannelIntegration,
  NewConversation,
  NewMessage,
} from '@expedition/application';

/**
 * Atendimento em memória — SÓ para dev sem banco e testes de rota (§5.17).
 *
 * Escrito aqui, e não reaproveitado do fake da aplicação, porque `*.fake.ts` fica fora do
 * build daquele pacote: o servidor não alcança. É a mesma razão de `inMemoryOpportunities`.
 */

type IntegrationRow = ChannelIntegrationRecord & { tenantId: string; webhookToken: string };
type ConversationRow = ConversationRecord & { tenantId: string };
type MessageRow = MessageRecord & { tenantId: string };

export function inMemoryChannelIntegrations(
  seed: readonly IntegrationRow[] = [],
): ChannelIntegrationRepository & { rows: IntegrationRow[] } {
  const rows: IntegrationRow[] = [...seed];
  let seq = 0;

  return {
    rows,

    upsert(integration: NewChannelIntegration) {
      const i = rows.findIndex(
        (r) => r.tenantId === integration.tenantId && r.channel === integration.channel,
      );
      if (i < 0 && integration.webhookToken === undefined) {
        return Promise.reject(new Error('upsert: conexão nova exige webhookToken'));
      }
      seq += 1;
      const record: IntegrationRow = {
        tenantId: integration.tenantId,
        id: i >= 0 ? rows[i]!.id : `ch-mem-${seq}`,
        channel: integration.channel,
        provider: integration.provider,
        baseUrl: integration.baseUrl,
        externalAccountId: integration.externalAccountId,
        accessToken: integration.accessToken,
        webhookToken: integration.webhookToken ?? rows[i]!.webhookToken,
        active: true,
        connectedAt: i >= 0 ? rows[i]!.connectedAt : new Date('2026-09-02T00:00:00Z'),
      };
      if (i >= 0) rows[i] = record;
      else rows.push(record);
      return Promise.resolve(record);
    },

    list: (tenantId) => Promise.resolve(rows.filter((r) => r.tenantId === tenantId)),

    findByChannel: (tenantId, channel: Channel) =>
      Promise.resolve(rows.find((r) => r.tenantId === tenantId && r.channel === channel) ?? null),

    findByWebhookToken: (tenantId, token) =>
      Promise.resolve(
        rows.find((r) => r.tenantId === tenantId && r.active && r.webhookToken === token) ?? null,
      ),

    remove(tenantId, channel: Channel) {
      const i = rows.findIndex((r) => r.tenantId === tenantId && r.channel === channel);
      if (i < 0) return Promise.resolve(false);
      rows.splice(i, 1);
      return Promise.resolve(true);
    },
  };
}

export function inMemoryConversations(): ConversationRepository & {
  conversations: ConversationRow[];
  messages: MessageRow[];
} {
  const conversations: ConversationRow[] = [];
  const messages: MessageRow[] = [];
  let seq = 0;

  const indice = (tenantId: string, id: string): number =>
    conversations.findIndex((c) => c.tenantId === tenantId && c.id === id);

  return {
    conversations,
    messages,

    findByChannelUser: (tenantId, channel: Channel, channelUserId) =>
      Promise.resolve(
        conversations.find(
          (c) =>
            c.tenantId === tenantId && c.channel === channel && c.channelUserId === channelUserId,
        ) ?? null,
      ),

    findConversationById: (tenantId, id) =>
      Promise.resolve(conversations.find((c) => c.tenantId === tenantId && c.id === id) ?? null),

    listConversations: (tenantId) =>
      Promise.resolve(
        conversations
          .filter((c) => c.tenantId === tenantId)
          .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0)),
      ),

    createConversation(conversation: NewConversation) {
      seq += 1;
      const record: ConversationRow = {
        tenantId: conversation.tenantId,
        id: `conv-mem-${seq}`,
        channel: conversation.channel,
        channelUserId: conversation.channelUserId,
        displayName: conversation.displayName,
        customerId: conversation.customerId,
        opportunityId: null,
        lastMessageAt: null,
        unreadCount: 0,
      };
      conversations.push(record);
      return Promise.resolve(record);
    },

    findMessageByExternalId: (tenantId, externalId) =>
      Promise.resolve(
        messages.find((m) => m.tenantId === tenantId && m.externalId === externalId) ?? null,
      ),

    addMessage(message: NewMessage) {
      seq += 1;
      const record: MessageRow = {
        tenantId: message.tenantId,
        id: `msg-mem-${seq}`,
        conversationId: message.conversationId,
        externalId: message.externalId,
        direction: message.direction,
        body: message.body,
        sentByUserId: message.sentByUserId,
        sentAt: message.sentAt,
      };
      messages.push(record);
      return Promise.resolve(record);
    },

    listMessages: (tenantId, conversationId) =>
      Promise.resolve(
        messages
          .filter((m) => m.tenantId === tenantId && m.conversationId === conversationId)
          .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime()),
      ),

    touchConversation(tenantId, conversationId, patch) {
      const i = indice(tenantId, conversationId);
      if (i < 0) return Promise.resolve();
      const atual = conversations[i]!;
      conversations[i] = {
        ...atual,
        lastMessageAt: patch.lastMessageAt,
        unreadCount: patch.incrementUnread ? atual.unreadCount + 1 : atual.unreadCount,
        ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
      };
      return Promise.resolve();
    },

    markRead(tenantId, conversationId) {
      const i = indice(tenantId, conversationId);
      if (i >= 0) conversations[i] = { ...conversations[i]!, unreadCount: 0 };
      return Promise.resolve();
    },

    attachToOpportunity(tenantId, conversationId, opportunityId) {
      const i = indice(tenantId, conversationId);
      conversations[i] = { ...conversations[i]!, opportunityId };
      return Promise.resolve(conversations[i]!);
    },
  };
}
