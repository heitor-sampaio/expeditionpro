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

/** CF-01 — as rotas da identidade da empresa. */

const ADMIN: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
let acting: RequestContext = ADMIN;

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('CF-01: GET e PUT /v1/company', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
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
        coupons: inMemoryCoupons(bookings.rows),
        identityRequests: inMemoryIdentityChange(),
        audit: inMemoryAudit(),
        memberships: inMemoryMemberships(),
        documents: inMemoryLegalDocuments(),
        consents: inMemoryConsents(),
        community: inMemoryCommunity(),
        media: inMemoryMediaConsents(),
        paymentIntegrations: inMemoryPaymentIntegrations(),
        charges: inMemoryPaymentCharges(),
        paymentGateway: asaasGateway(),
        resolveContext: () => Promise.resolve(acting),
      },
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    acting = ADMIN;
  });

  it('lê a identidade da empresa', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/company' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Drakkar Expedições' });
  });

  it('salva razão social, CNPJ e logo', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/company',
      payload: { name: 'Drakkar Expedições', cnpj: '19.131.243/0001-97', logo: PNG },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ cnpj: '19131243000197', logo: PNG });
  });

  it('CNPJ inválido responde 422', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/company',
      payload: { name: 'Drakkar', cnpj: '11.111.111/1111-11' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'invalid_cnpj' });
  });

  it('imagem em formato que o PDF não embute responde 422', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/company',
      payload: { name: 'Drakkar', logo: 'data:image/webp;base64,UklGRh4A' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'invalid_logo' });
  });

  it('operator não salva — 403', async () => {
    acting = { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u2', role: 'operator' } };
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/v1/company',
        payload: { name: 'Outra' },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      acting = ADMIN;
    }
  });

  it('cliente não lê — 403', async () => {
    acting = { tenantId: 'tenant-a', actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } };
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/company' });
      expect(res.statusCode).toBe(403);
    } finally {
      acting = ADMIN;
    }
  });
});
