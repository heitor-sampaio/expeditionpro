import type {
  CommunicationConsentRepository,
  ConsentChannel,
  GrantConsentInput,
} from '@expedition/application';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma do consentimento de comunicação (§5.9 · DOC-06 · CM-04). Ledger
 * por canal: conceder cria linha ativa se não houver; revogar carimba `revoked_at`. O
 * índice único parcial `(tenant_id, customer_id, channel) WHERE revoked_at IS NULL` é o
 * backstop de "no máximo um ativo por canal". Histórico nunca é apagado (LGPD).
 */
export function prismaCommunicationConsentRepository(
  base: PrismaClient,
): CommunicationConsentRepository {
  return {
    async listActiveChannels(tenantId: string, customerId: string): Promise<ConsentChannel[]> {
      const rows = await tenantClient(base, tenantId).communicationConsent.findMany({
        where: { customerId, revokedAt: null },
        select: { channel: true },
      });
      return rows.map((r) => r.channel as ConsentChannel);
    },

    async grant(input: GrantConsentInput): Promise<void> {
      const db = tenantClient(base, input.tenantId);
      const active = await db.communicationConsent.findFirst({
        where: { customerId: input.customerId, channel: input.channel, revokedAt: null },
        select: { id: true },
      });
      if (active) return;
      await db.communicationConsent.create({
        data: {
          tenantId: input.tenantId,
          customerId: input.customerId,
          channel: input.channel,
          grantedAt: input.grantedAt,
          source: input.source,
        },
      });
    },

    async revoke(
      tenantId: string,
      customerId: string,
      channel: ConsentChannel,
      revokedAt: Date,
    ): Promise<void> {
      await tenantClient(base, tenantId).communicationConsent.updateMany({
        where: { customerId, channel, revokedAt: null },
        data: { revokedAt },
      });
    },
  };
}
