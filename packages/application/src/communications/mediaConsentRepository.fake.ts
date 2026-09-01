import type {
  GrantMediaConsentInput,
  MediaConsentRepository,
  MediaScope,
} from './mediaConsentRepository.js';

interface Row {
  tenantId: string;
  customerId: string;
  scope: MediaScope;
  grantedAt: Date;
  revokedAt: Date | null;
  source: string;
}

/** Fake in-memory do consentimento de imagem. Excluído do build (`*.fake.ts`). */
export function fakeMediaConsentRepository(): MediaConsentRepository & { rows: Row[] } {
  const rows: Row[] = [];
  const active = (t: string, c: string, s: MediaScope) =>
    rows.find(
      (r) => r.tenantId === t && r.customerId === c && r.scope === s && r.revokedAt === null,
    );

  return {
    rows,
    listActiveScopes(tenantId, customerId) {
      const scopes = rows
        .filter(
          (r) => r.tenantId === tenantId && r.customerId === customerId && r.revokedAt === null,
        )
        .map((r) => r.scope);
      return Promise.resolve([...new Set(scopes)]);
    },
    grant(input: GrantMediaConsentInput) {
      if (!active(input.tenantId, input.customerId, input.scope)) {
        rows.push({
          tenantId: input.tenantId,
          customerId: input.customerId,
          scope: input.scope,
          grantedAt: input.grantedAt,
          revokedAt: null,
          source: input.source,
        });
      }
      return Promise.resolve();
    },
    revoke(tenantId, customerId, scope, revokedAt) {
      const row = active(tenantId, customerId, scope);
      if (row) row.revokedAt = revokedAt;
      return Promise.resolve();
    },
  };
}
