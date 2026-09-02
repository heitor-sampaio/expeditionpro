import type { Channel } from './conversationRepository.js';

/**
 * AT-01 — a conexão do tenant com cada canal.
 *
 * Espelha `payment_integrations`, inclusive na divisão dos segredos: o que precisa voltar em
 * claro para chamar a API do provedor vai **cifrado** (`accessToken`); o que só é comparado
 * vai **hasheado** (`webhookToken`). A cifra e o hash vivem na infraestrutura — a aplicação
 * nunca soube que existem, como já acontece no gateway de pagamento.
 */

export type ChannelProvider = 'evolution' | 'meta';

export interface NewChannelIntegration {
  readonly tenantId: string;
  readonly channel: Channel;
  readonly provider: ChannelProvider;
  /** Onde a instância vive. Para a Meta, a base da Graph API. */
  readonly baseUrl: string;
  /** Nome da instância na Evolution; id da página/conta na Meta. */
  readonly externalAccountId: string;
  readonly accessToken: string;
  /**
   * Só na **primeira** conexão. Reconectar omite: trocar o segredo exigiria reconfigurar o
   * webhook no provedor, e a mensagem pararia de chegar em silêncio até alguém notar.
   */
  readonly webhookToken?: string | undefined;
  /**
   * AT-02 — endereços de onde o provedor pode chamar o webhook. Vazio = cerca desligada.
   *
   * Existe porque nem toda instalação deixa configurar cabeçalho nem corpo na chamada; aí o
   * único jeito de saber quem está do outro lado é o endereço da conexão.
   */
  readonly allowedIps: readonly string[];
  readonly connectedBy: string | null;
}

export interface ChannelIntegrationRecord {
  readonly id: string;
  readonly channel: Channel;
  readonly provider: ChannelProvider;
  readonly baseUrl: string;
  readonly externalAccountId: string;
  readonly accessToken: string;
  readonly allowedIps: readonly string[];
  readonly active: boolean;
  readonly connectedAt: Date;
}

export interface ChannelIntegrationRepository {
  /** Uma conexão por canal: reconectar **atualiza**, não empilha. */
  upsert(integration: NewChannelIntegration): Promise<ChannelIntegrationRecord>;
  list(tenantId: string): Promise<ChannelIntegrationRecord[]>;
  findByChannel(tenantId: string, channel: Channel): Promise<ChannelIntegrationRecord | null>;
  /** AT-02: é isto que autentica o webhook. Compara o hash, nunca o segredo. */
  findByWebhookToken(tenantId: string, token: string): Promise<ChannelIntegrationRecord | null>;
  remove(tenantId: string, channel: Channel): Promise<boolean>;
}
