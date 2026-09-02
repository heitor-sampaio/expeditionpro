import type {
  Channel,
  ChannelIntegrationRecord,
  ChannelIntegrationRepository,
  ConversationRecord,
  ConversationRepository,
  MessageRecord,
  MediaStore,
  MessagingGateway,
  NewChannelIntegration,
  NewConversation,
  NewMedia,
  NewMessage,
  OutboundMedia,
  OutboundText,
  SendOutcome,
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
        allowedIps: integration.allowedIps,
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

/**
 * AT-13 — armazenamento de mídia em memória, para dev sem banco e testes de rota. Não guarda
 * nada: devolve um caminho e uma URL de mentira, que é o bastante para exercitar o fluxo.
 */
export function inMemoryMediaStore(): MediaStore {
  return {
    save: (media: NewMedia) =>
      Promise.resolve({
        path: `${media.tenantId}/${media.conversationId}/${media.externalId}`,
        sizeBytes: Math.floor((media.base64.length * 3) / 4),
      }),
    signedUrls: (paths: readonly string[]) =>
      Promise.resolve(new Map(paths.map((path) => [path, `https://exemplo.local/${path}`]))),
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

    findByChannelUser: (tenantId, channel: Channel, formas) => {
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
      const i = indice(tenantId, conversationId);
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
        id: `conv-mem-${seq}`,
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
        id: `msg-mem-${seq}`,
        conversationId: message.conversationId,
        externalId: message.externalId,
        direction: message.direction,
        body: message.body,
        sentByUserId: message.sentByUserId,
        media: message.media,
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
      const entrando = patch.direction === 'in';
      conversations[i] = {
        ...atual,
        lastMessageAt: patch.at,
        ...(entrando ? { lastInboundAt: patch.at } : { lastOutboundAt: patch.at }),
        unreadCount: entrando ? atual.unreadCount + 1 : 0,
        ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
      };
      return Promise.resolve();
    },

    linkCustomer(tenantId, conversationId, customerId) {
      const i = indice(tenantId, conversationId);
      if (i >= 0) conversations[i] = { ...conversations[i]!, customerId };
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

/**
 * Provedor de mensagem em memória — SÓ para dev sem banco e testes de rota (§5.17).
 *
 * Aceita tudo e devolve um id sequencial. `falharCom` existe para o teste exercitar o caminho
 * de recusa, que é onde mora a regra: mensagem que o provedor não aceitou **não** entra no fio.
 */
export function inMemoryMessagingGateway(): MessagingGateway & {
  enviadas: { to: string; text: string }[];
  falharCom(detalhe: string): void;
} {
  const enviadas: { to: string; text: string }[] = [];
  let falha: string | null = null;
  let seq = 0;

  return {
    enviadas,
    falharCom(detalhe: string) {
      falha = detalhe;
    },
    sendText(message: OutboundText): Promise<SendOutcome> {
      if (falha !== null) return Promise.resolve({ ok: false, detail: falha });
      enviadas.push({ to: message.to, text: message.text });
      seq += 1;
      return Promise.resolve({ ok: true, externalId: `DEV-${seq}` });
    },

    sendMedia(message: OutboundMedia): Promise<SendOutcome> {
      if (falha !== null) return Promise.resolve({ ok: false, detail: falha });
      enviadas.push({ to: message.to, text: message.caption ?? `[${message.kind}]` });
      seq += 1;
      return Promise.resolve({ ok: true, externalId: `DEV-${seq}` });
    },
  };
}
