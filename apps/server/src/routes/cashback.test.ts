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
import type { CashbackConfig, RequestContext } from '@expedition/application';
import type { FastifyInstance } from 'fastify';

const TEAM: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
// Contexto ativo do servidor — mutável para o teste poder agir como cliente na auto-inscrição.
let acting: RequestContext = TEAM;
const asCustomer = (customerId: string): RequestContext => ({
  tenantId: 'tenant-a',
  actor: { kind: 'customer', customerId, userId: 'auth-1' },
});

const CONFIG: CashbackConfig = {
  enabled: true,
  mode: 'percent',
  value: 5,
  base: 'paid',
  releaseDays: 30,
  validityMonths: 12,
  maxRedemptionPct: 50,
};

const PRICE = {
  validFrom: '2025-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

describe('CB-03/CB-05/CB-08: rotas de cashback', () => {
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
        cashback: inMemoryCashback({ config: CONFIG, override: { kind: 'inherit' } }),
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
        resolveContext: () => Promise.resolve(acting),
      },
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('§5.8: inscrição da equipe (manual) não gera cashback, mesmo com o módulo ligado', async () => {
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Cashback Rica', prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2025-11-10', endDate: '2025-11-14' },
      })
    ).json();
    const resp = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'R',
          cpf: '90000010057',
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
    // confirma com pagamento (base = paid) de 120000
    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/payments`,
      payload: { amountCents: 120000, method: 'pix', paidAt: '2025-11-01' },
    });

    // A inscrição foi criada pela equipe (source `manual`): o snapshot congelou `{ rule: null }`,
    // então liberar cashback não credita nada — só a auto-inscrição do cliente gera crédito.
    const accrue = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/cashback/accrue`,
    });
    expect(accrue.statusCode).toBe(201);
    expect(accrue.json().credited).toBe(false);
    expect(accrue.json().amountCents).toBe(0);

    const stmt = await app.inject({ method: 'GET', url: `/v1/customers/${resp.id}/cashback` });
    expect(stmt.json().balanceCents).toBe(0);
    expect(stmt.json().availableCents).toBe(0);
    expect(stmt.json().entries).toHaveLength(0);
  });

  it('§5.8: auto-inscrição do cliente pelo portal GERA cashback (fluxo completo)', async () => {
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Portal Rica', prices: PRICE },
      })
    ).json();
    // O grupo nasce aberto e público → aceita a auto-inscrição.
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2025-11-10', endDate: '2025-11-14' },
      })
    ).json();
    const resp = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'Cliente App',
          cpf: '11144477735',
          birthDate: '1989-01-14',
          email: 'app@ex.com',
          phone: '48999998877',
        },
      })
    ).json();

    // o cliente pede a inscrição pelo portal (origem `portal` → cashback aplicável)
    acting = asCustomer(resp.id);
    const enroll = await app.inject({
      method: 'POST',
      url: `/v1/portal/groups/${ev.group.id}/enroll`,
      payload: { participantCustomerIds: [resp.id] },
    });
    acting = TEAM;
    expect(enroll.statusCode).toBe(201);

    // §5.8: o pedido entra na fila; a equipe revisa e aloca — e é a alocação que cria a
    // inscrição, preservando a origem `portal` (é ela que mantém o cashback, CB-09).
    const allocated = await app.inject({
      method: 'POST',
      url: `/v1/intake/${enroll.json().intakeId}/allocate`,
      payload: { groupId: ev.group.id },
    });
    expect(allocated.statusCode).toBe(201);
    const bookingId = allocated.json().bookingId;

    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${bookingId}/payments`,
      payload: { amountCents: 120000, method: 'pix', paidAt: '2025-11-01' },
    });
    const accrue = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${bookingId}/cashback/accrue`,
    });
    expect(accrue.json().credited).toBe(true);
    expect(accrue.json().amountCents).toBe(6000); // 5% de 120000

    const stmt = await app.inject({ method: 'GET', url: `/v1/customers/${resp.id}/cashback` });
    expect(stmt.json().balanceCents).toBe(6000);
  });
});

describe('CB-01/CB-02: rotas de config de cashback', () => {
  async function configServer() {
    const app = await buildServer({
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
        resolveContext: () => Promise.resolve(acting),
      },
    });
    await app.ready();
    return app;
  }

  it('GET devolve a config desligada por padrão; PUT persiste e a leitura reflete', async () => {
    const app = await configServer();
    const initial = await app.inject({ method: 'GET', url: '/v1/cashback/config' });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().enabled).toBe(false);

    const put = await app.inject({ method: 'PUT', url: '/v1/cashback/config', payload: CONFIG });
    expect(put.statusCode).toBe(200);
    expect(put.json().value).toBe(5);

    const after = await app.inject({ method: 'GET', url: '/v1/cashback/config' });
    expect(after.json().enabled).toBe(true);
    expect(after.json().maxRedemptionPct).toBe(50);
    await app.close();
  });

  it('CB-01: percentual acima de 100 é barrado na borda (400)', async () => {
    const app = await configServer();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/cashback/config',
      payload: { ...CONFIG, maxRedemptionPct: 150 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
