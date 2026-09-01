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
        webhookToken: integration.webhookToken,
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
      return Promise.resolve(rows.find((r) => r.webhookToken === token) ?? null);
    },
    remove(_tenantId: string, provider: string, environment: PaymentEnvironment) {
      const index = indexOf(provider, environment);
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve();
    },
  };
}
