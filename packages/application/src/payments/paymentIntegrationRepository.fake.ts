import type { FeeSettings } from '@expedition/domain';
import type {
  NewPaymentIntegration,
  PaymentEnvironment,
  PaymentIntegrationRecord,
  PaymentIntegrationRepository,
} from './paymentIntegrationRepository.js';

/** Fake in-memory da conexão com o gateway. Excluído do build (`*.fake.ts`). */
export function fakePaymentIntegrationRepository(): PaymentIntegrationRepository & {
  rows: PaymentIntegrationRecord[];
} {
  const rows: PaymentIntegrationRecord[] = [];
  let seq = 0;

  const indexOf = (provider: string, environment: PaymentEnvironment) =>
    rows.findIndex((r) => r.provider === provider && r.environment === environment);

  return {
    rows,
    upsert(integration: NewPaymentIntegration) {
      const index = indexOf(integration.provider, integration.environment);
      const previous = index >= 0 ? rows[index]! : null;
      seq += 1;
      const record: PaymentIntegrationRecord = {
        id: previous?.id ?? `pi-${seq}`,
        provider: integration.provider,
        environment: integration.environment,
        accessToken: integration.accessToken,
        webhookTokenHash:
          integration.webhookToken === undefined
            ? (previous?.webhookTokenHash ?? '')
            : fakeHash(integration.webhookToken),
        accountName: integration.accountName,
        feeSettings: previous?.feeSettings ?? {},
        active: true,
        connectedAt: integration.connectedAt,
        lastCheckedAt: integration.connectedAt,
      };
      if (index >= 0) rows[index] = record;
      else rows.push(record);
      return Promise.resolve(record);
    },
    setFeeSettings(
      _tenantId: string,
      provider: string,
      environment: PaymentEnvironment,
      feeSettings: FeeSettings,
    ) {
      const index = indexOf(provider, environment);
      if (index < 0) return Promise.reject(new Error('integração não encontrada'));
      const updated = { ...rows[index]!, feeSettings };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    find(_tenantId: string, provider: string, environment: PaymentEnvironment) {
      const index = indexOf(provider, environment);
      return Promise.resolve(index >= 0 ? rows[index]! : null);
    },
    list() {
      return Promise.resolve([...rows]);
    },
    findByWebhookToken(_tenantId: string, token: string) {
      return Promise.resolve(rows.find((r) => r.webhookTokenHash === fakeHash(token)) ?? null);
    },
    remove(_tenantId: string, provider: string, environment: PaymentEnvironment) {
      const index = indexOf(provider, environment);
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve();
    },
  };
}

/**
 * Hash de mentira, e de propósito: `sha256` real exigiria `node:crypto`, e esta camada é
 * pura — não conhece Node nem Prisma. O contrato que o fake precisa honrar é só este: o
 * mesmo segredo acha a linha, um segredo diferente não acha, e **o valor em claro não
 * aparece no que fica guardado**. A definição de verdade vive na infraestrutura, e o teste
 * de integração é quem a prova.
 */
function fakeHash(token: string): string {
  let acc = 0;
  for (const ch of token) acc = (acc * 31 + ch.codePointAt(0)!) % 0xffffffff;
  return `fake-sha256-${acc.toString(16)}`;
}
