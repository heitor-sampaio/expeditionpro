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

/**
 * GR-15 — a rota da roomlist. O que se testa aqui é a borda: sai PDF de verdade, com
 * nome de arquivo, sem cache, e só para quem pode.
 */

const OWNER: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
let acting: RequestContext = OWNER;

const PRICE = {
  validFrom: '2025-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

describe('GR-15: GET /v1/groups/:groupId/roomlist.pdf', () => {
  let app: FastifyInstance;
  let groupId: string;

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

    const itinerary = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Coxilha Rica', prices: PRICE },
      })
    ).json();
    const event = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itinerary.id, startDate: '2026-11-10', endDate: '2026-11-14' },
      })
    ).json();
    groupId = event.group.id;

    const responsible = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'Ana Lima',
          cpf: '11144477735',
          birthDate: '1990-05-20',
          email: 'ana@example.com',
          phone: '48999998877',
        },
      })
    ).json();
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/bookings`,
        payload: {
          responsibleCustomerId: responsible.id,
          participantCustomerIds: [responsible.id],
        },
      })
    ).json();
    // Confirmada: é o que entra na roomlist.
    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/confirm`,
      payload: { note: 'pago fora do sistema' },
    });
  });

  afterAll(async () => {
    await app.close();
    acting = OWNER;
  });

  it('devolve um PDF anexado, sem cache', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/roomlist.pdf` });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('roomlist-');
    // O arquivo carrega CPF e endereço: não pode ficar em cache de proxy nem do navegador.
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('operator não gera — 403', async () => {
    acting = { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u2', role: 'operator' } };
    try {
      const res = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/roomlist.pdf` });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'forbidden' });
    } finally {
      acting = OWNER;
    }
  });

  it('cliente não gera — 403', async () => {
    acting = { tenantId: 'tenant-a', actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } };
    try {
      const res = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/roomlist.pdf` });
      expect(res.statusCode).toBe(403);
    } finally {
      acting = OWNER;
    }
  });

  it('grupo inexistente — 404, sem confirmar existência', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/groups/00000000-0000-0000-0000-000000000000/roomlist.pdf',
    });

    expect(res.statusCode).toBe(404);
  });

  describe('GR-17: a lista do comboio, nos dois formatos', () => {
    it('PDF sai como PDF', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/comboio.pdf` });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('comboio-');
      expect(res.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('XLSX sai como planilha', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/comboio.xlsx` });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.rawPayload.subarray(0, 2).toString('latin1')).toBe('PK');
    });

    it('formato desconhecido é recusado na borda', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/comboio.docx` });

      expect(res.statusCode).toBe(400);
    });

    it('operator não gera — 403', async () => {
      acting = { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u2', role: 'operator' } };
      try {
        const res = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/comboio.pdf` });
        expect(res.statusCode).toBe(403);
      } finally {
        acting = OWNER;
      }
    });
  });

  describe('GR-16: a lista do seguro na mesma saída', () => {
    it('devolve um xlsx anexado, sem cache', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/seguro.xlsx` });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('seguro-');
      expect(res.headers['cache-control']).toBe('no-store');
      // Zip: é assim que todo xlsx começa.
      expect(res.rawPayload.subarray(0, 2).toString('latin1')).toBe('PK');
    });

    it('operator não gera — 403', async () => {
      acting = { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u2', role: 'operator' } };
      try {
        const res = await app.inject({ method: 'GET', url: `/v1/groups/${groupId}/seguro.xlsx` });
        expect(res.statusCode).toBe(403);
      } finally {
        acting = OWNER;
      }
    });

    it('grupo inexistente — 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/groups/00000000-0000-0000-0000-000000000000/seguro.xlsx',
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
