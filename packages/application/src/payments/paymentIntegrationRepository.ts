import type { FeeSettings } from '@expedition/domain';

/**
 * PG-01 — port da conexão do tenant com o gateway. O `accessToken` trafega **em claro
 * dentro da aplicação** (é preciso para chamar o provedor) e é a infraestrutura que o
 * cifra ao gravar e decifra ao ler: nenhuma camada acima precisa saber disso, e nenhuma
 * resposta de API o carrega.
 */

export type PaymentEnvironment = 'sandbox' | 'production';

export interface PaymentIntegrationRecord {
  readonly id: string;
  readonly provider: string;
  readonly environment: PaymentEnvironment;
  readonly accessToken: string;
  /**
   * SEC-01 — só o `sha256` do segredo. O valor em claro sai **uma vez**, na conexão, e o
   * banco nunca mais o tem: era o único segredo do sistema guardado cru, e é justamente o
   * que separa a internet de "marcar inscrição como paga".
   */
  readonly webhookTokenHash: string;
  readonly accountName: string | null;
  /** PG-04: taxas negociadas por forma de pagamento. Vazio = nenhuma taxa aplicada. */
  readonly feeSettings: FeeSettings;
  readonly active: boolean;
  readonly connectedAt: Date;
  readonly lastCheckedAt: Date | null;
}

export interface NewPaymentIntegration {
  readonly tenantId: string;
  readonly provider: string;
  readonly environment: PaymentEnvironment;
  readonly accessToken: string;
  /** Em claro. Ausente numa reconexão: o repositório mantém o hash que já existe. */
  readonly webhookToken?: string | undefined;
  readonly accountName: string | null;
  readonly connectedBy: string | null;
  readonly connectedAt: Date;
}

export interface PaymentIntegrationRepository {
  /** Reconectar é atualizar: a chave velha não fica para trás. */
  upsert(integration: NewPaymentIntegration): Promise<PaymentIntegrationRecord>;
  find(
    tenantId: string,
    provider: string,
    environment: PaymentEnvironment,
  ): Promise<PaymentIntegrationRecord | null>;
  list(tenantId: string): Promise<PaymentIntegrationRecord[]>;
  /** PG-04: grava as taxas do contrato daquele ambiente. */
  setFeeSettings(
    tenantId: string,
    provider: string,
    environment: PaymentEnvironment,
    feeSettings: FeeSettings,
  ): Promise<PaymentIntegrationRecord>;
  /** PG-03: o webhook chega sabendo o tenant pela URL e se prova pelo token. */
  findByWebhookToken(tenantId: string, token: string): Promise<PaymentIntegrationRecord | null>;
  remove(tenantId: string, provider: string, environment: PaymentEnvironment): Promise<void>;
}
