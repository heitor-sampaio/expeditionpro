import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { inMemoryChannelIntegrations, inMemoryConversations } from '../dev/inMemoryMessaging.js';
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
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const clienteCtx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u2', customerId: 'c1' },
};

/* Quem a rota diz ser — mutável, para trocar de audiência no mesmo servidor. */
let atual: RequestContext = ctx;

const PRICE = {
  validFrom: '2025-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

describe('AG-02/AG-03: rotas da agenda', () => {
  let app: FastifyInstance;
  let itineraryId: string;

  beforeAll(async () => {
    app = await buildServer({
      logger: false,
      deps: {
        customers: inMemoryCustomers(),
        vehicles: inMemoryVehicles(),
        itineraries: inMemoryItineraries(),
        schedule: inMemorySchedule(),
        bookings: inMemoryBookings(),
        payments: inMemoryPayments([]),
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
        documents: inMemoryLegalDocuments(),
        consents: inMemoryConsents(),
        community: inMemoryCommunity(),
        media: inMemoryMediaConsents(),
        paymentIntegrations: inMemoryPaymentIntegrations(),
        charges: inMemoryPaymentCharges(),
        paymentGateway: asaasGateway(),
        resolveContext: () => Promise.resolve(atual),
      },
    });
    await app.ready();
    itineraryId = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Coxilha Rica', prices: PRICE },
      })
    ).json().id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('cria evento e devolve 201 com o grupo aninhado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schedule-events',
      payload: { itineraryId, startDate: '2025-11-10', endDate: '2025-11-14' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.startDate).toBe('2025-11-10');
    expect(body.group.pricingMode).toBe('itinerary');
    expect(body.group.status).toBe('open');
  });

  it('lista os eventos criados com evento + grupo e a ocupação (AG-06)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/schedule-events' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThanOrEqual(1);
    const ev = res.json()[0];
    expect(ev.group).toBeDefined();
    // AG-06: cada evento traz a ocupação (sem inscrições ainda → zerada)
    expect(ev.occupancy).toEqual({
      capacityVehicles: null,
      confirmedCount: 0,
      pendingCount: 0,
      vacancies: null,
    });
  });

  it('AG-02: término antes do início responde 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schedule-events',
      payload: { itineraryId, startDate: '2025-11-14', endDate: '2025-11-10' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_date_range');
  });

  it('AG-04: PATCH muda a data e o nome do grupo acompanha', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId, startDate: '2025-11-10', endDate: '2025-11-14' },
      })
    ).json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/schedule-events/${created.id}`,
      payload: { startDate: '2025-12-01', endDate: '2025-12-05' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().startDate).toBe('2025-12-01');
    expect(res.json().group.name).toBe('Coxilha Rica · 01/12/2025');
  });

  it('AG-05: DELETE sem inscrições responde 204', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId, startDate: '2025-11-10', endDate: '2025-11-14' },
      })
    ).json();

    const res = await app.inject({ method: 'DELETE', url: `/v1/schedule-events/${created.id}` });
    expect(res.statusCode).toBe(204);
  });

  it('AG-05: DELETE com inscrição é bloqueado (400 group_has_bookings)', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId, startDate: '2025-11-10', endDate: '2025-11-14' },
      })
    ).json();
    const resp = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'Resp',
          cpf: '90000010057',
          birthDate: '1989-01-14',
          email: 'r@ex.com',
          phone: '48999998877',
        },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/groups/${created.group.id}/bookings`,
      payload: { responsibleCustomerId: resp.id, participantCustomerIds: [resp.id] },
    });

    const res = await app.inject({ method: 'DELETE', url: `/v1/schedule-events/${created.id}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('group_has_bookings');
  });
  it('AG-05: POST /v1/groups/:groupId/cancel marca a saída como cancelada', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId, startDate: '2025-11-10', endDate: '2025-11-14' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/groups/${created.group.id}/cancel`,
      payload: { reason: 'Estrada interditada' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('cancelled');

    // cancelar de novo é recusado; motivo vazio não passa da borda
    const again = await app.inject({
      method: 'POST',
      url: `/v1/groups/${created.group.id}/cancel`,
      payload: { reason: 'De novo' },
    });
    expect(again.statusCode).toBe(400);
    expect(again.json().error).toBe('already_cancelled');

    const noReason = await app.inject({
      method: 'POST',
      url: `/v1/groups/${created.group.id}/cancel`,
      payload: { reason: '' },
    });
    expect(noReason.statusCode).toBe(400);
  });

  it('SEC-01: cliente recebe 403 na agenda de back-office — grupo privado não é dele', async () => {
    atual = clienteCtx;
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/schedule-events' });
      expect(res.statusCode).toBe(403);
    } finally {
      atual = ctx;
    }
  });
});
