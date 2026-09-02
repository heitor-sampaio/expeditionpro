import type {
  ChannelIntegrationRecord,
  ChannelIntegrationRepository,
  NewChannelIntegration,
} from './channelIntegrationRepository.js';
import type { Channel } from './conversationRepository.js';

/**
 * Fake in-memory das conexões de canal (§5.17). Fora do build.
 *
 * Guarda `webhookToken` em claro de propósito: no banco ele é hash, e a comparação vive na
 * infraestrutura. Aqui só se prova que **o token errado não passa**.
 */
type Row = ChannelIntegrationRecord & { tenantId: string; webhookToken: string };

export function fakeChannelIntegrationRepository(
  seed: readonly Row[] = [],
): ChannelIntegrationRepository & { rows: Row[] } {
  const rows: Row[] = [...seed];
  let seq = 0;

  return {
    rows,

    upsert(integration: NewChannelIntegration) {
      const i = rows.findIndex(
        (r) => r.tenantId === integration.tenantId && r.channel === integration.channel,
      );
      seq += 1;
      const record: Row = {
        tenantId: integration.tenantId,
        id: i >= 0 ? rows[i]!.id : `ch-${seq}`,
        channel: integration.channel,
        provider: integration.provider,
        baseUrl: integration.baseUrl,
        externalAccountId: integration.externalAccountId,
        accessToken: integration.accessToken,
        webhookToken: integration.webhookToken,
        active: true,
        connectedAt: i >= 0 ? rows[i]!.connectedAt : new Date('2026-09-02T00:00:00Z'),
      };
      if (i >= 0) rows[i] = record;
      else rows.push(record);
      return Promise.resolve(record);
    },

    list: (tenantId) => Promise.resolve(rows.filter((r) => r.tenantId === tenantId)),

    findByChannel: (tenantId, channel: Channel) =>
      Promise.resolve(rows.find((r) => r.tenantId === tenantId && r.channel === channel) ?? null),

    findByWebhookToken: (tenantId, token) =>
      Promise.resolve(
        rows.find((r) => r.tenantId === tenantId && r.active && r.webhookToken === token) ?? null,
      ),

    remove(tenantId, channel: Channel) {
      const i = rows.findIndex((r) => r.tenantId === tenantId && r.channel === channel);
      if (i < 0) return Promise.resolve(false);
      rows.splice(i, 1);
      return Promise.resolve(true);
    },
  };
}
