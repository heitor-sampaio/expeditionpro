import { describe, expect, it } from 'vitest';
import { parseCpf, parseLocalDate } from '@expedition/domain';
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
import { EMPTY_ADDRESS } from '@expedition/application';
import type { CustomerRepository, RequestContext } from '@expedition/application';
import type { FastifyInstance } from 'fastify';

const TENANT = 'tenant-a';

async function seededServer(): Promise<{
  app: FastifyInstance;
  resp1: string;
  comp1: string;
  resp2: string;
  identityRequests: ReturnType<typeof inMemoryIdentityChange>;
}> {
  const customers = inMemoryCustomers();
  const resp1 = await customers.create({
    tenantId: TENANT,
    responsibleId: null,
    fullName: 'Resp Um',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1985-01-01'),
    email: 'r1@ex.com',
    phone: null,
    address: EMPTY_ADDRESS,
  });
  const comp1 = await customers.create({
    tenantId: TENANT,
    responsibleId: resp1.id,
    fullName: 'Comp Um',
    cpf: parseCpf('277.373.070-44'),
    birthDate: parseLocalDate('1987-02-02'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
  const resp2 = await customers.create({
    tenantId: TENANT,
    responsibleId: null,
    fullName: 'Resp Dois',
    cpf: parseCpf('500.400.300-91'),
    birthDate: parseLocalDate('1990-03-03'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });

  const ctx: RequestContext = {
    tenantId: TENANT,
    actor: { kind: 'customer', customerId: resp1.id, userId: 'u1' },
  };
  const identityRequests = inMemoryIdentityChange();
  const app = await serverWith(customers, ctx, identityRequests);
  return { app, resp1: resp1.id, comp1: comp1.id, resp2: resp2.id, identityRequests };
}

async function serverWith(
  customers: CustomerRepository,
  ctx: RequestContext,
  identityRequests: ReturnType<typeof inMemoryIdentityChange> = inMemoryIdentityChange(),
): Promise<FastifyInstance> {
  const bookings = inMemoryBookings();
  const app = await buildServer({
    logger: false,
    deps: {
      customers,
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
      identityRequests,
      audit: inMemoryAudit(),
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
  await app.ready();
  return app;
}

describe('PC-06/PC-08: rotas do portal (escrita do cliente)', () => {
  it('PC-06: PATCH contato do próprio cliente — 200, telefone/endereço atualizados, CPF mascarado', async () => {
    const { app, resp1 } = await seededServer();
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/portal/customers/${resp1}/contact`,
      payload: { phone: '48999990000', address: { city: 'Florianópolis', state: 'SC' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.phone).toBe('+55 (48)99999-0000'); // E.164 exibido formatado
    expect(body.address.city).toBe('Florianópolis');
    expect(body.cpf).toBe('153.***.***-56'); // SEC-04
    expect(body.fullName).toBe('Resp Um'); // identidade intacta
    await app.close();
  });

  it('PC-06: PATCH contato de outra família responde 403', async () => {
    const { app, resp2 } = await seededServer();
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/portal/customers/${resp2}/contact`,
      payload: { phone: '11111111111' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('PC-08: POST acompanhante cria sob a própria família (role companion)', async () => {
    const { app } = await seededServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/companions',
      payload: { fullName: 'Filho', cpf: '52998224725', birthDate: '2015-05-05' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().role).toBe('companion');
    expect(res.json().cpf).toBe('529.***.***-25');
    await app.close();
  });

  it('PC-06: POST veículo para um membro da família — 201', async () => {
    const { app, resp1 } = await seededServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/vehicles',
      payload: { customerId: resp1, plate: 'ABC1D23', brandOther: 'Jeep' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().needsCatalogReview).toBe(true);
    await app.close();
  });

  it('PC-06: POST veículo para outra família responde 403', async () => {
    const { app, resp2 } = await seededServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/vehicles',
      payload: { customerId: resp2, plate: 'XYZ9Z99' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('PC-07: POST pedido de identidade da própria família — 201 pending', async () => {
    const { app, resp1 } = await seededServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/identity-change-requests',
      payload: { customerId: resp1, fullName: 'Resp Um Silva', reason: 'casamento' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('pending');
    await app.close();
  });

  it('PC-07: portal só solicita mudança de NOME — birthDate/cpf enviados são descartados', async () => {
    const { app, resp1, identityRequests } = await seededServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/identity-change-requests',
      payload: {
        customerId: resp1,
        fullName: 'Resp Um Silva',
        birthDate: '2000-12-31',
        cpf: '111.111.111-11',
      },
    });
    expect(res.statusCode).toBe(201);
    const pending = await identityRequests.listPending(TENANT);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.fullName).toBe('Resp Um Silva'); // nome passa
    expect(pending[0]!.birthDate).toBeNull(); // nascimento é só da equipe (descartado → null)
    expect(pending[0]!.cpf).toBeNull(); // cpf idem
    await app.close();
  });

  it('PC-07: pedido de identidade para outra família responde 403', async () => {
    const { app, resp2 } = await seededServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/portal/identity-change-requests',
      payload: { customerId: resp2, fullName: 'Hacker' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('§5.8: GET família do portal devolve responsável + acompanhantes da própria família', async () => {
    const { app, resp1 } = await seededServer();
    const res = await app.inject({ method: 'GET', url: '/v1/portal/family' });
    expect(res.statusCode).toBe(200);
    const family = res.json() as { id: string; role: string }[];
    expect(family).toHaveLength(2); // resp1 + comp1
    expect(family.find((m) => m.id === resp1)!.role).toBe('responsible');
    expect(family.some((m) => m.role === 'companion')).toBe(true);
    await app.close();
  });

  it('§5.8: GET expedições do portal responde 200 com lista (só saídas abertas)', async () => {
    const { app } = await seededServer();
    const res = await app.inject({ method: 'GET', url: '/v1/portal/expeditions' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});
