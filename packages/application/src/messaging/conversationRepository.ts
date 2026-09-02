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
  /** A identidade no canal: LID quando existe, senão o telefone (AT-05). */
  readonly channelUserId: string;
  /** O telefone, quando conhecido. É o que disca e o que casa com a ficha (AT-06). */
  readonly phone: string | null;
  readonly displayName: string | null;
  readonly customerId: string | null;
  readonly opportunityId: string | null;
  /**
   * AT-07 — a **última atividade**, de qualquer lado. É por onde a caixa ordena.
   *
   * Existe junto dos dois de baixo, e não no lugar deles, porque ordenar por "o maior entre
   * dois" não usa índice: a lista é lida a cada mensagem que chega.
   */
  readonly lastMessageAt: Date | null;
  /** Quando o contato falou pela última vez. Responde "ele já respondeu?". */
  readonly lastInboundAt: Date | null;
  /** Quando nós falamos pela última vez. Responde "nós já respondemos?". */
  readonly lastOutboundAt: Date | null;
  readonly unreadCount: number;
}

export interface NewConversation {
  readonly tenantId: string;
  readonly channel: Channel;
  readonly channelUserId: string;
  readonly phone: string | null;
  readonly displayName: string | null;
  readonly customerId: string | null;
}

/** AT-13: o anexo de uma mensagem, já guardado. `path` é do bucket, nunca uma URL. */
export interface MessageMedia {
  readonly kind: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  readonly mimeType: string;
  readonly fileName: string | null;
  readonly path: string;
  readonly sizeBytes: number;
}

export interface MessageRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly externalId: string;
  readonly direction: MessageDirection;
  readonly body: string;
  /** AT-08: quem da equipe respondeu. `null` em mensagem recebida. */
  readonly sentByUserId: string | null;
  readonly media: MessageMedia | null;
  readonly sentAt: Date;
}

export interface NewMessage {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly externalId: string;
  readonly direction: MessageDirection;
  readonly body: string;
  readonly sentByUserId: string | null;
  readonly media: MessageMedia | null;
  /** AT-04: corpo cru do webhook, como o intake guarda. Nunca vai para o log. */
  readonly payload: unknown;
  readonly sentAt: Date;
}

export interface ConversationRepository {
  /**
   * AT-05 — procura pelas **duas** formas de endereçamento do mesmo contato.
   *
   * Durante a migração do WhatsApp para o LID a mesma pessoa chega ora por telefone, ora por
   * LID. Procurar só por uma abriria um segundo fio, e o histórico ficaria partido ao meio.
   */
  findByChannelUser(
    tenantId: string,
    channel: Channel,
    identidade: { channelUserId: string; phone: string | null },
  ): Promise<ConversationRecord | null>;
  /**
   * AT-05 — a conversa converge para o LID assim que ele aparece: é a identidade que não
   * muda, enquanto telefone o cliente troca.
   */
  updateIdentity(
    tenantId: string,
    conversationId: string,
    identidade: { channelUserId: string; phone: string | null },
  ): Promise<ConversationRecord>;
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
  /**
   * Carimba os horários da conversa a partir de uma mensagem.
   *
   * A **direção decide tudo**: qual dos dois carimbos anda e se o não lido sobe. Passar as
   * duas coisas separadas abriria espaço para elas discordarem — e discordando, uma conversa
   * respondida pela equipe apareceria como não lida para sempre.
   */
  touchConversation(
    tenantId: string,
    conversationId: string,
    patch: { at: Date; direction: MessageDirection; displayName?: string | null },
  ): Promise<void>;
  /** AT-06: liga a conversa a uma ficha de cliente. */
  linkCustomer(tenantId: string, conversationId: string, customerId: string): Promise<void>;
  markRead(tenantId: string, conversationId: string): Promise<void>;
  attachToOpportunity(
    tenantId: string,
    conversationId: string,
    opportunityId: string | null,
  ): Promise<ConversationRecord>;
}
