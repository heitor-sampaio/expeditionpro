import type {
  GrantMediaConsentInput,
  MediaConsentRepository,
  MediaScope,
} from '@expedition/application';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma do consentimento de imagem (§5.12 · CO-10). Ledger por escopo:
 * conceder cria linha ativa se não houver; revogar carimba `revoked_at`. Histórico
 * preservado (LGPD). O tenant é injetado pela Client Extension.
 */
export function prismaMediaConsentRepository(base: PrismaClient): MediaConsentRepository {
  return {
    async listActiveScopes(tenantId: string, customerId: string): Promise<MediaScope[]> {
      const rows = await tenantClient(base, tenantId).mediaConsent.findMany({
        where: { customerId, revokedAt: null },
        select: { scope: true },
      });
      return rows.map((r) => r.scope as MediaScope);
    },

    async grant(input: GrantMediaConsentInput): Promise<void> {
      const db = tenantClient(base, input.tenantId);
      const active = await db.mediaConsent.findFirst({
        where: { customerId: input.customerId, scope: input.scope, revokedAt: null },
        select: { id: true },
      });
      if (active) return;
      await db.mediaConsent.create({
        data: {
          tenantId: input.tenantId,
          customerId: input.customerId,
          scope: input.scope,
          grantedAt: input.grantedAt,
          source: input.source,
        },
      });
    },

    async revoke(
      tenantId: string,
      customerId: string,
      scope: MediaScope,
      revokedAt: Date,
    ): Promise<void> {
      await tenantClient(base, tenantId).mediaConsent.updateMany({
        where: { customerId, scope, revokedAt: null },
        data: { revokedAt },
      });
    },
  };
}
