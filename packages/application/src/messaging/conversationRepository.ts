/**
 * §5.17 — conversas e mensagens.
 *
 * A conversa é identificada por `(canal, id do usuário no canal)`. No WhatsApp esse id é o
 * telefone; no Instagram e no Messenger é um id opaco **por aplicativo** (PSID/IGSID), que não
 * é telefone nem e-mail e não serve para achar a pessoa em lugar nenhum. Casar por identidade
 * real nesses canais é impossível, e fingir que dá é o caminho para misturar duas pessoas.
 */

export type Channel = 'whatsapp' | 'instagram' | 'messenger';
export type MessageDirection = 'in' | 'out';

export interface ConversationRecord {
  readonly id: string;
  readonly channel: Channel;
  readonly channelUserId: string;
  readonly displayName: string | null;
  readonly customerId: string | null;
  readonly opportunityId: string | null;
  readonly lastMessageAt: Date | null;
  readonly unreadCount: number;
}

export interface NewConversation {
  readonly tenantId: string;
  readonly channel: Channel;
  readonly channelUserId: string;
  readonly displayName: string | null;
  readonly customerId: string | null;
}

export interface MessageRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly externalId: string;
  readonly direction: MessageDirection;
  readonly body: string;
  /** AT-08: quem da equipe respondeu. `null` em mensagem recebida. */
  readonly sentByUserId: string | null;
  readonly sentAt: Date;
}

export interface NewMessage {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly externalId: string;
  readonly direction: MessageDirection;
  readonly body: string;
  readonly sentByUserId: string | null;
  /** AT-04: corpo cru do webhook, como o intake guarda. Nunca vai para o log. */
  readonly payload: unknown;
  readonly sentAt: Date;
}

export interface ConversationRepository {
  findByChannelUser(
    tenantId: string,
    channel: Channel,
    channelUserId: string,
  ): Promise<ConversationRecord | null>;
  findConversationById(tenantId: string, id: string): Promise<ConversationRecord | null>;
  /** Mais recente primeiro: a caixa é lida de cima para baixo. */
  listConversations(tenantId: string): Promise<ConversationRecord[]>;
  createConversation(conversation: NewConversation): Promise<ConversationRecord>;
  /**
   * AT-03: a marca de idempotência. Todo provedor reenvia até receber 200, e o id da
   * mensagem no provedor é o que impede a repetida de virar linha nova.
   */
  findMessageByExternalId(tenantId: string, externalId: string): Promise<MessageRecord | null>;
  addMessage(message: NewMessage): Promise<MessageRecord>;
  listMessages(tenantId: string, conversationId: string): Promise<MessageRecord[]>;
  /** Carimba o horário da última mensagem e soma ao não lido quando ela é de entrada. */
  touchConversation(
    tenantId: string,
    conversationId: string,
    patch: { lastMessageAt: Date; incrementUnread: boolean; displayName?: string | null },
  ): Promise<void>;
  markRead(tenantId: string, conversationId: string): Promise<void>;
  attachToOpportunity(
    tenantId: string,
    conversationId: string,
    opportunityId: string | null,
  ): Promise<ConversationRecord>;
}
