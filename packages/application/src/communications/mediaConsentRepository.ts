/**
 * Port do consentimento de imagem/mídia (§5.12 · CO-10 · LGPD). Ledger por escopo:
 * conceder cria linha ativa (`revoked_at` nulo); revogar carimba. Escopo `community` é o
 * direito de uso de imagem na comunidade; `marketing`, em campanhas. Histórico nunca apagado.
 */

export type MediaScope = 'community' | 'marketing';

export interface GrantMediaConsentInput {
  readonly tenantId: string;
  readonly customerId: string;
  readonly scope: MediaScope;
  readonly source: string;
  readonly grantedAt: Date;
}

export interface MediaConsentRepository {
  listActiveScopes(tenantId: string, customerId: string): Promise<MediaScope[]>;
  grant(input: GrantMediaConsentInput): Promise<void>;
  revoke(tenantId: string, customerId: string, scope: MediaScope, revokedAt: Date): Promise<void>;
}
