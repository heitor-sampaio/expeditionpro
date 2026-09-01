import type {
  GrantMediaConsentInput,
  MediaConsentRepository,
  MediaScope,
} from '@expedition/application';

/** Consentimento de imagem em memória — SÓ para dev e testes de rota. Ledger por escopo. */
export function inMemoryMediaConsents(): MediaConsentRepository {
  const rows: {
    tenantId: string;
    customerId: string;
    scope: MediaScope;
    revokedAt: Date | null;
  }[] = [];
  const active = (t: string, c: string, s: MediaScope) =>
    rows.find(
      (r) => r.tenantId === t && r.customerId === c && r.scope === s && r.revokedAt === null,
    );

  return {
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
          revokedAt: null,
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
