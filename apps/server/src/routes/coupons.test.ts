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

/**
 * CP-01..CP-08 — as rotas de cupom. A borda valida com Zod, o DTO é explícito, e o
 * motivo da recusa chega ao cliente com código estável (o front traduz).
 */

const TEAM: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
let acting: RequestContext = TEAM;

const PRICE = {
  validFrom: '2025-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

describe('CP-01: rotas de cupom', () => {
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
        opportunities: inMemoryOpportunities(),
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
    acting = TEAM;
  });
  afterAll(async () => {
    await app.close();
  });

  async function makeBooking(cpf: string) {
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: `Roteiro ${cpf}`, prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2026-11-10', endDate: '2026-11-14' },
      })
    ).json();
    const resp = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'Responsável',
          cpf,
          birthDate: '1989-01-14',
          email: 'r@ex.com',
          phone: '48999998877',
        },
      })
    ).json();
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${ev.group.id}/bookings`,
        payload: { responsibleCustomerId: resp.id, participantCustomerIds: [resp.id] },
      })
    ).json();
    return { booking, itineraryId: itin.id, groupId: ev.group.id };
  }

  it('cria, lista e desativa um cupom', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/coupons',
      payload: { code: 'primavera15', mode: 'percent', value: 15 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ code: 'PRIMAVERA15', active: true, uses: 0 });

    const list = await app.inject({ method: 'GET', url: '/v1/coupons' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/v1/coupons/${created.json().id}`,
      payload: { active: false },
    });
    expect(patched.json().active).toBe(false);
  });

  it('recusa código malformado com 400 e código repetido com o motivo', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/coupons',
      payload: { code: 'REPETIDO10', mode: 'fixed', value: 10000 },
    });

    const curto = await app.inject({
      method: 'POST',
      url: '/v1/coupons',
      payload: { code: 'ab', mode: 'percent', value: 10 },
    });
    expect(curto.statusCode).toBe(400);

    const repetido = await app.inject({
      method: 'POST',
      url: '/v1/coupons',
      payload: { code: 'repetido10', mode: 'fixed', value: 10000 },
    });
    expect(repetido.statusCode).toBe(400);
    expect(repetido.json()).toEqual({ error: 'code_taken' });
  });

  /**
   * CP-05 — o cupom é desconto que o **cliente** resgata no ato de se inscrever e pagar,
   * não ferramenta de balcão. A casa gera o código aqui e entrega; quem dá desconto pelo
   * back-office usa o override de preço, que baixa o contratado com motivo registrado.
   *
   * Este teste existe para a porta continuar fechada: enquanto o fluxo do cliente não
   * chega, é fácil alguém "devolver" a rota achando que faltou. O efeito do cupom no
   * dinheiro é testado no caso de uso (`couponEffects.test.ts`), onde ele vive.
   */
  it('CP-05: a equipe não aplica nem remove cupom pela API', async () => {
    const { booking } = await makeBooking('11144477735');
    await app.inject({
      method: 'POST',
      url: '/v1/coupons',
      payload: { code: 'MESA20', mode: 'percent', value: 20 },
    });

    const aplicar = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/coupon`,
      payload: { code: 'mesa20' },
    });
    const remover = await app.inject({
      method: 'DELETE',
      url: `/v1/bookings/${booking.id}/coupon`,
    });

    expect(aplicar.statusCode).toBe(404);
    expect(remover.statusCode).toBe(404);
  });

  it('CP-06: o cliente não alcança nenhuma rota de cupom', async () => {
    acting = { tenantId: 'tenant-a', actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } };
    try {
      const list = await app.inject({ method: 'GET', url: '/v1/coupons' });
      expect(list.statusCode).toBe(403);

      const create = await app.inject({
        method: 'POST',
        url: '/v1/coupons',
        payload: { code: 'CLIENTE10', mode: 'percent', value: 10 },
      });
      expect(create.statusCode).toBe(403);
    } finally {
      acting = TEAM;
    }
  });
});
