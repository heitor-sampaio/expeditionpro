import { createHash } from 'node:crypto';
import type {
  Channel,
  ChannelIntegrationRecord,
  ChannelIntegrationRepository,
  ChannelProvider,
  ConversationRecord,
  ConversationRepository,
  MessageDirection,
  MessageRecord,
  NewChannelIntegration,
  NewConversation,
  NewMessage,
} from '@expedition/application';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  ChannelIntegration as PrismaIntegration,
  Conversation as PrismaConversation,
  Message as PrismaMessage,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';
import type { TokenCipher } from '../payments/tokenCipher.js';

/**
 * §5.17 — persistência do atendimento.
 *
 * A divisão dos segredos é a mesma do gateway de pagamento, e pelo mesmo raciocínio: o que
 * precisa voltar em claro para chamar a API do provedor é **cifrado**; o que só é comparado é
 * **hasheado**. A fronteira é este arquivo — a aplicação nunca soube que existe cifra.
 */
export function prismaChannelIntegrationRepository(
  base: PrismaClient,
  cipher: TokenCipher,
): ChannelIntegrationRepository {
  const toRecord = (row: PrismaIntegration): ChannelIntegrationRecord => ({
    id: row.id,
    channel: row.channel as Channel,
    provider: row.provider as ChannelProvider,
    baseUrl: row.baseUrl,
    externalAccountId: row.externalAccountId,
    accessToken: cipher.decrypt(row.accessToken),
    active: row.active,
    connectedAt: row.connectedAt,
  });

  return {
    async upsert(integration: NewChannelIntegration): Promise<ChannelIntegrationRecord> {
      // Reconectar **não** toca no hash do webhook: o endereço já está configurado no painel
      // do provedor, e trocar o segredo faria a mensagem parar de chegar em silêncio.
      if (integration.webhookToken === undefined) {
        const existente = await tenantClient(
          base,
          integration.tenantId,
        ).channelIntegration.findFirst({
          where: { channel: integration.channel },
          select: { id: true },
        });
        // Conexão nova sem segredo seria linha sem hash, e o webhook não teria como se provar.
        if (!existente) throw new Error('upsert: conexão nova exige webhookToken');
      }

      const row = await tenantClient(base, integration.tenantId).channelIntegration.upsert({
        where: {
          tenantId_channel: { tenantId: integration.tenantId, channel: integration.channel },
        },
        create: {
          tenantId: integration.tenantId,
          channel: integration.channel,
          provider: integration.provider,
          baseUrl: integration.baseUrl,
          externalAccountId: integration.externalAccountId,
          accessToken: cipher.encrypt(integration.accessToken),
          webhookTokenHash: sha256(integration.webhookToken ?? ''),
          connectedBy: integration.connectedBy,
        },
        update: {
          provider: integration.provider,
          baseUrl: integration.baseUrl,
          externalAccountId: integration.externalAccountId,
          accessToken: cipher.encrypt(integration.accessToken),
          ...(integration.webhookToken === undefined
            ? {}
            : { webhookTokenHash: sha256(integration.webhookToken) }),
          active: true,
        },
      });
      return toRecord(row);
    },

    async list(tenantId: string): Promise<ChannelIntegrationRecord[]> {
      const rows = await tenantClient(base, tenantId).channelIntegration.findMany({
        orderBy: { channel: 'asc' },
      });
      return rows.map(toRecord);
    },

    async findByChannel(
      tenantId: string,
      channel: Channel,
    ): Promise<ChannelIntegrationRecord | null> {
      const row = await tenantClient(base, tenantId).channelIntegration.findFirst({
        where: { channel },
      });
      return row ? toRecord(row) : null;
    },

    async findByWebhookToken(
      tenantId: string,
      token: string,
    ): Promise<ChannelIntegrationRecord | null> {
      // Compara o hash, nunca o segredo: no banco só existe o hash.
      const row = await tenantClient(base, tenantId).channelIntegration.findFirst({
        where: { webhookTokenHash: sha256(token), active: true },
      });
      return row ? toRecord(row) : null;
    },

    async remove(tenantId: string, channel: Channel): Promise<boolean> {
      const { count } = await tenantClient(base, tenantId).channelIntegration.deleteMany({
        where: { channel },
      });
      return count > 0;
    },
  };
}

export function prismaConversationRepository(base: PrismaClient): ConversationRepository {
  return {
    async findByChannelUser(
      tenantId: string,
      channel: Channel,
      channelUserId: string,
    ): Promise<ConversationRecord | null> {
      const row = await tenantClient(base, tenantId).conversation.findFirst({
        where: { channel, channelUserId },
      });
      return row ? toConversation(row) : null;
    },

    async findConversationById(tenantId: string, id: string): Promise<ConversationRecord | null> {
      const row = await tenantClient(base, tenantId).conversation.findFirst({ where: { id } });
      return row ? toConversation(row) : null;
    },

    async listConversations(tenantId: string): Promise<ConversationRecord[]> {
      const rows = await tenantClient(base, tenantId).conversation.findMany({
        // Mais recente primeiro; conversa sem mensagem nenhuma vai para o fim.
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }],
      });
      return rows.map(toConversation);
    },

    async createConversation(conversation: NewConversation): Promise<ConversationRecord> {
      const row = await tenantClient(base, conversation.tenantId).conversation.create({
        data: {
          tenantId: conversation.tenantId,
          channel: conversation.channel,
          channelUserId: conversation.channelUserId,
          displayName: conversation.displayName,
          customerId: conversation.customerId,
        },
      });
      return toConversation(row);
    },

    async findMessageByExternalId(
      tenantId: string,
      externalId: string,
    ): Promise<MessageRecord | null> {
      const row = await tenantClient(base, tenantId).message.findFirst({ where: { externalId } });
      return row ? toMessage(row) : null;
    },

    async addMessage(message: NewMessage): Promise<MessageRecord> {
      const row = await tenantClient(base, message.tenantId).message.create({
        data: {
          tenantId: message.tenantId,
          conversationId: message.conversationId,
          externalId: message.externalId,
          direction: message.direction,
          body: message.body,
          sentByUserId: message.sentByUserId,
          payload: message.payload as Prisma.InputJsonValue,
          sentAt: message.sentAt,
        },
      });
      return toMessage(row);
    },

    async listMessages(tenantId: string, conversationId: string): Promise<MessageRecord[]> {
      const rows = await tenantClient(base, tenantId).message.findMany({
        where: { conversationId },
        orderBy: { sentAt: 'asc' },
      });
      return rows.map(toMessage);
    },

    async touchConversation(
      tenantId: string,
      conversationId: string,
      patch: { lastMessageAt: Date; incrementUnread: boolean; displayName?: string | null },
    ): Promise<void> {
      await tenantClient(base, tenantId).conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: patch.lastMessageAt,
          // `increment` e não leitura-e-soma: duas mensagens chegando juntas somariam 1 se
          // cada uma lesse o mesmo valor antes de gravar.
          ...(patch.incrementUnread ? { unreadCount: { increment: 1 } } : {}),
          ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
        },
      });
    },

    async markRead(tenantId: string, conversationId: string): Promise<void> {
      await tenantClient(base, tenantId).conversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 },
      });
    },

    async attachToOpportunity(
      tenantId: string,
      conversationId: string,
      opportunityId: string | null,
    ): Promise<ConversationRecord> {
      const row = await tenantClient(base, tenantId).conversation.update({
        where: { id: conversationId },
        data: { opportunityId },
      });
      return toConversation(row);
    },
  };
}

function toConversation(row: PrismaConversation): ConversationRecord {
  return {
    id: row.id,
    channel: row.channel as Channel,
    channelUserId: row.channelUserId,
    displayName: row.displayName,
    customerId: row.customerId,
    opportunityId: row.opportunityId,
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount,
  };
}

function toMessage(row: PrismaMessage): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    externalId: row.externalId,
    direction: row.direction as MessageDirection,
    body: row.body,
    sentByUserId: row.sentByUserId,
    sentAt: row.sentAt,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
