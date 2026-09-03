import { beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryCustomers } from '../dev/inMemoryCustomers.js';
import { inMemoryVehicles } from '../dev/inMemoryVehicles.js';
import { inMemoryItineraries } from '../dev/inMemoryItineraries.js';
import { inMemorySchedule } from '../dev/inMemorySchedule.js';
import { inMemoryBookings } from '../dev/inMemoryBookings.js';
import { inMemoryPayments } from '../dev/inMemoryPayments.js';
import { inMemorySuppliers } from '../dev/inMemorySuppliers.js';
import { inMemoryApiKeys, inMemoryIntake } from '../dev/inMemoryIntake.js';
import { inMemoryFormMappings } from '../dev/inMemoryFormMappings.js';
import { inMemoryTenants } from '../dev/inMemoryTenants.js';
import { inMemoryCashback } from '../dev/inMemoryCashback.js';
import { inMemoryCoupons } from '../dev/inMemoryCoupons.js';
import { inMemoryIdentityChange } from '../dev/inMemoryIdentityChange.js';
import { inMemoryAudit } from '../dev/inMemoryAudit.js';
import { inMemoryMemberships } from '../dev/inMemoryMemberships.js';
import {
  inMemoryChannelIntegrations,
  inMemoryConversations,
  inMemoryMediaStore,
  inMemoryMessagingGateway,
} from '../dev/inMemoryMessaging.js';
import { inMemoryAutomations } from '../dev/inMemoryAutomations.js';
import { inMemoryOpportunities } from '../dev/inMemoryOpportunities.js';
import { inMemoryLegalDocuments } from '../dev/inMemoryLegalDocuments.js';
import { inMemoryConsents } from '../dev/inMemoryConsents.js';
import { inMemoryCommunity } from '../dev/inMemoryCommunity.js';
import { inMemoryMediaConsents } from '../dev/inMemoryMediaConsents.js';
import {
  inMemoryPaymentIntegrations,
  inMemoryPaymentCharges,
} from '../dev/inMemoryPaymentGateway.js';
import { asaasGateway } from '@expedition/infrastructure';
import type { RequestContext } from '@expedition/application';
import type { FastifyInstance } from 'fastify';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

function build(): Promise<FastifyInstance> {
  const bookings = inMemoryBookings();
  return buildServer({
    logger: false,
    deps: {
      customers: inMemoryCustomers(),
      vehicles: inMemoryVehicles(),
      itineraries: inMemoryItineraries(),
      schedule: inMemorySchedule(),
      bookings,
      payments: inMemoryPayments(bookings.rows),
      suppliers: inMemorySuppliers(),
      apiKeys: inMemoryApiKeys([]),
      intake: inMemoryIntake(),
      formMappings: inMemoryFormMappings(),
      tenants: inMemoryTenants(),
      cashback: inMemoryCashback(),
      coupons: inMemoryCoupons(),
      identityRequests: inMemoryIdentityChange(),
      audit: inMemoryAudit(),
      memberships: inMemoryMemberships(),
      opportunities: inMemoryOpportunities(),
      channelIntegrations: inMemoryChannelIntegrations(),
      conversations: inMemoryConversations(),
      messagingGateway: inMemoryMessagingGateway(),
      conversationMedia: inMemoryMediaStore(),
      automations: inMemoryAutomations(),
      documents: inMemoryLegalDocuments(),
      consents: inMemoryConsents(),
      community: inMemoryCommunity(),
      media: inMemoryMediaConsents(),
      paymentIntegrations: inMemoryPaymentIntegrations(),
      charges: inMemoryPaymentCharges(),
      paymentGateway: asaasGateway(),
      resolveContext: () => Promise.resolve(ctx),
    },
  });
}

describe('DOC-06/CM-04: consentimento de comunicação via HTTP', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await build();
    await app.ready();
  });

  it('nasce desmarcado, liga o e-mail e faz opt-out de um clique', async () => {
    const before = await app.inject({ method: 'GET', url: '/v1/customers/c1/consents' });
    expect(before.json()).toEqual({ email: false, push: false });

    const grant = await app.inject({
      method: 'PUT',
      url: '/v1/customers/c1/consents/email',
      payload: { granted: true },
    });
    expect(grant.statusCode).toBe(200);
    expect(grant.json()).toEqual({ email: true, push: false });

    const revoke = await app.inject({
      method: 'PUT',
      url: '/v1/customers/c1/consents/email',
      payload: { granted: false },
    });
    expect(revoke.json()).toEqual({ email: false, push: false });
  });

  it('canal desconhecido é recusado (400)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/customers/c1/consents/sms',
      payload: { granted: true },
    });
    expect(res.statusCode).toBe(400);
  });
});
