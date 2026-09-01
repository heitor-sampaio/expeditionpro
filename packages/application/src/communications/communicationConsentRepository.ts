/**
 * Port do consentimento de comunicação (§5.9 · DOC-06 · CM-04). Ledger por canal:
 * conceder cria uma linha ativa (`revoked_at` nulo); revogar carimba `revoked_at`.
 * O histórico nunca é apagado — o ônus da prova do consentimento é do controlador (LGPD).
 * Ativo por canal = existe linha com `revoked_at` nulo.
 */

export type ConsentChannel = 'email' | 'push';

export interface GrantConsentInput {
  readonly tenantId: string;
  readonly customerId: string;
  readonly channel: ConsentChannel;
  readonly source: string; // 'portal' | 'site' | 'admin'
  readonly grantedAt: Date;
}

export interface CommunicationConsentRepository {
  /** Canais com consentimento ativo (revoked_at nulo) do cliente. */
  listActiveChannels(tenantId: string, customerId: string): Promise<ConsentChannel[]>;
  /** Concede o canal se ainda não houver consentimento ativo (idempotente). */
  grant(input: GrantConsentInput): Promise<void>;
  /** Revoga o consentimento ativo do canal, se houver (carimba revoked_at). */
  revoke(
    tenantId: string,
    customerId: string,
    channel: ConsentChannel,
    revokedAt: Date,
  ): Promise<void>;
}
