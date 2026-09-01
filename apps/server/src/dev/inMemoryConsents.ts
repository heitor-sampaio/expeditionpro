import type {
  CommunicationConsentRepository,
  ConsentChannel,
  GrantConsentInput,
} from '@expedition/application';

interface Row {
  tenantId: string;
  customerId: string;
  channel: ConsentChannel;
  grantedAt: Date;
  revokedAt: Date | null;
  source: string;
}

/** Consentimento de comunicação em memória — SÓ para dev e testes de rota. Ledger. */
export function inMemoryConsents(): CommunicationConsentRepository {
  const rows: Row[] = [];
  const active = (t: string, c: string, ch: ConsentChannel) =>
    rows.find(
      (r) => r.tenantId === t && r.customerId === c && r.channel === ch && r.revokedAt === null,
    );

  return {
    listActiveChannels(tenantId, customerId) {
      const channels = rows
        .filter(
          (r) => r.tenantId === tenantId && r.customerId === customerId && r.revokedAt === null,
        )
        .map((r) => r.channel);
      return Promise.resolve([...new Set(channels)]);
    },
    grant(input: GrantConsentInput) {
      if (!active(input.tenantId, input.customerId, input.channel)) {
        rows.push({
          tenantId: input.tenantId,
          customerId: input.customerId,
          channel: input.channel,
          grantedAt: input.grantedAt,
          revokedAt: null,
          source: input.source,
        });
      }
      return Promise.resolve();
    },
    revoke(tenantId, customerId, channel, revokedAt) {
      const row = active(tenantId, customerId, channel);
      if (row) row.revokedAt = revokedAt;
      return Promise.resolve();
    },
  };
}
