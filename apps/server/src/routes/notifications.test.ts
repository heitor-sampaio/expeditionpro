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
import { inMemoryLegalDocuments } from '../dev/inMemoryLegalDocuments.js';
import { inMemoryConsents } from '../dev/inMemoryConsents.js';
import { inMemoryCommunity } from '../dev/inMemoryCommunity.js';
import { inMemoryMediaConsents } from '../dev/inMemoryMediaConsents.js';
import {
  inMemoryPaymentIntegrations,
  inMemoryPaymentCharges,
} from '../dev/inMemoryPaymentGateway.js';
import { asaasGateway } from '@expedition/infrastructure';
import { inMemoryNotifications } from '../dev/inMemoryNotifications.js';
import type { RequestContext } from '@expedition/application';
import type { FastifyInstance } from 'fastify';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

const PRICE = {
  validFrom: '2025-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

describe('PC-23: notificações no fluxo de inscrição', () => {
  let app: FastifyInstance;
  let notifications: ReturnType<typeof inMemoryNotifications>;
  let groupId: string;

  beforeAll(async () => {
    notifications = inMemoryNotifications();
    const bookings = inMemoryBookings();
    app = await buildServer({
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
        documents: inMemoryLegalDocuments(),
        consents: inMemoryConsents(),
        community: inMemoryCommunity(),
        media: inMemoryMediaConsents(),
        paymentIntegrations: inMemoryPaymentIntegrations(),
        charges: inMemoryPaymentCharges(),
        paymentGateway: asaasGateway(),
        notifications,
        resolveContext: () => Promise.resolve(ctx),
      },
    });
    await app.ready();
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Notif Rica', prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2025-11-10', endDate: '2025-11-14' },
      })
    ).json();
    groupId = ev.group.id;
  });

  it('"recebida" ao alocar e "confirmada" no primeiro recebimento', async () => {
    const resp = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'Ana',
          cpf: '153.509.460-56',
          birthDate: '1985-01-14',
          email: 'ana@ex.com',
          phone: '48999990000',
        },
      })
    ).json();
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/bookings`,
        payload: { responsibleCustomerId: resp.id, participantCustomerIds: [resp.id] },
      })
    ).json();

    expect(notifications.sent.at(-1)).toMatchObject({ kind: 'received', to: 'ana@ex.com' });

    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/payments`,
      payload: { amountCents: 60000, method: 'pix', paidAt: '2025-11-01' },
    });
    expect(notifications.sent.at(-1)).toMatchObject({
      kind: 'confirmed',
      groupName: expect.any(String),
    });
  });
});
