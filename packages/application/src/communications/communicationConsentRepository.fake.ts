import type {
  CommunicationConsentRepository,
  ConsentChannel,
  GrantConsentInput,
} from './communicationConsentRepository.js';

interface ConsentRow {
  tenantId: string;
  customerId: string;
  channel: ConsentChannel;
  grantedAt: Date;
  revokedAt: Date | null;
  source: string;
}

/** Fake in-memory do consentimento de comunicação. Excluído do build (`*.fake.ts`). */
export function fakeCommunicationConsentRepository(): CommunicationConsentRepository & {
  rows: ConsentRow[];
} {
  const rows: ConsentRow[] = [];

  const activeRow = (tenantId: string, customerId: string, channel: ConsentChannel) =>
    rows.find(
      (r) =>
        r.tenantId === tenantId &&
        r.customerId === customerId &&
        r.channel === channel &&
        r.revokedAt === null,
    );

  return {
    rows,
    listActiveChannels(tenantId: string, customerId: string) {
      const channels = rows
        .filter(
          (r) => r.tenantId === tenantId && r.customerId === customerId && r.revokedAt === null,
        )
        .map((r) => r.channel);
      return Promise.resolve([...new Set(channels)]);
    },
    grant(input: GrantConsentInput) {
      if (!activeRow(input.tenantId, input.customerId, input.channel)) {
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
    revoke(tenantId: string, customerId: string, channel: ConsentChannel, revokedAt: Date) {
      const row = activeRow(tenantId, customerId, channel);
      if (row) row.revokedAt = revokedAt;
      return Promise.resolve();
    },
  };
}
