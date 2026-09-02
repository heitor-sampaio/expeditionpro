import type {
  Channel,
  ConversationRecord,
  ConversationRepository,
  MessageRecord,
  NewConversation,
  NewMessage,
} from './conversationRepository.js';

type ConversationRow = ConversationRecord & { tenantId: string };
type MessageRow = MessageRecord & { tenantId: string };

/** Fake in-memory das conversas (§5.17). Fora do build. */
export function fakeConversationRepository(): ConversationRepository & {
  conversations: ConversationRow[];
  messages: MessageRow[];
  payloads: unknown[];
} {
  const conversations: ConversationRow[] = [];
  const messages: MessageRow[] = [];
  // O corpo cru guardado, para o teste conferir o que foi (e o que não foi) persistido.
  const payloads: unknown[] = [];
  let seq = 0;

  return {
    conversations,
    messages,
    payloads,

    findByChannelUser: (tenantId, channel: Channel, identidade) => {
      const formas = [identidade.channelUserId, identidade.phone].filter(
        (forma): forma is string => forma !== null,
      );
      return Promise.resolve(
        conversations.find(
          (c) =>
            c.tenantId === tenantId &&
            c.channel === channel &&
            (formas.includes(c.channelUserId) || (c.phone !== null && formas.includes(c.phone))),
        ) ?? null,
      );
    },

    updateIdentity(tenantId, conversationId, identidade) {
      const i = conversations.findIndex((c) => c.tenantId === tenantId && c.id === conversationId);
      conversations[i] = { ...conversations[i]!, ...identidade };
      return Promise.resolve(conversations[i]!);
    },

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
        id: `conv-${seq}`,
        channel: conversation.channel,
        channelUserId: conversation.channelUserId,
        phone: conversation.phone,
        displayName: conversation.displayName,
        customerId: conversation.customerId,
        opportunityId: null,
        lastMessageAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
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
        id: `msg-${seq}`,
        conversationId: message.conversationId,
        externalId: message.externalId,
        direction: message.direction,
        body: message.body,
        sentByUserId: message.sentByUserId,
        media: message.media,
        sentAt: message.sentAt,
      };
      messages.push(record);
      payloads.push(message.payload);
      return Promise.resolve(record);
    },

    listMessages: (tenantId, conversationId) =>
      Promise.resolve(
        messages
          .filter((m) => m.tenantId === tenantId && m.conversationId === conversationId)
          .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime()),
      ),

    touchConversation(tenantId, conversationId, patch) {
      const i = conversations.findIndex((c) => c.tenantId === tenantId && c.id === conversationId);
      if (i < 0) return Promise.resolve();
      const atual = conversations[i]!;
      const entrando = patch.direction === 'in';
      conversations[i] = {
        ...atual,
        lastMessageAt: patch.at,
        ...(entrando ? { lastInboundAt: patch.at } : { lastOutboundAt: patch.at }),
        unreadCount: entrando ? atual.unreadCount + 1 : atual.unreadCount,
        ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
      };
      return Promise.resolve();
    },

    markRead(tenantId, conversationId) {
      const i = conversations.findIndex((c) => c.tenantId === tenantId && c.id === conversationId);
      if (i >= 0) conversations[i] = { ...conversations[i]!, unreadCount: 0 };
      return Promise.resolve();
    },

    attachToOpportunity(tenantId, conversationId, opportunityId) {
      const i = conversations.findIndex((c) => c.tenantId === tenantId && c.id === conversationId);
      conversations[i] = { ...conversations[i]!, opportunityId };
      return Promise.resolve(conversations[i]!);
    },
  };
}
