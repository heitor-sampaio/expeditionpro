import { describe, expect, it } from 'vitest';
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
import { inMemoryAuthAdmin } from '../dev/inMemoryAuthAdmin.js';
import type { AuthAdminGateway, RequestContext } from '@expedition/application';
import type { FastifyInstance } from 'fastify';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

async function serverWith(authAdmin: AuthAdminGateway | undefined): Promise<FastifyInstance> {
  const bookings = inMemoryBookings();
  const app = await buildServer({
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
      documents: inMemoryLegalDocuments(),
      consents: inMemoryConsents(),
      community: inMemoryCommunity(),
      media: inMemoryMediaConsents(),
      paymentIntegrations: inMemoryPaymentIntegrations(),
      charges: inMemoryPaymentCharges(),
      paymentGateway: asaasGateway(),
      authAdmin,
      resolveContext: () => Promise.resolve(ctx),
    },
  });
  await app.ready();
  return app;
}

describe('§3.7: POST /v1/team/invitations', () => {
  it('convida e responde 201 com userId e actionLink; grava o papel enviado', async () => {
    const authAdmin = inMemoryAuthAdmin();
    const app = await serverWith(authAdmin);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/invitations',
      payload: { email: 'novo@drakkar.com', role: 'operator' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().userId).toBeDefined();
    expect(res.json().actionLink).toBeDefined();
    expect(authAdmin.invites).toHaveLength(1);
    expect(authAdmin.invites[0]!.tenantId).toBe('tenant-a'); // do contexto, não do corpo
    expect(authAdmin.invites[0]!.role).toBe('operator');
    await app.close();
  });

  it('papel fora do enum (owner/customer) responde 400 na borda', async () => {
    const app = await serverWith(inMemoryAuthAdmin());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/invitations',
      payload: { email: 'x@y.com', role: 'owner' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('e-mail inválido responde 400', async () => {
    const app = await serverWith(inMemoryAuthAdmin());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/invitations',
      payload: { email: 'nao-e-email', role: 'viewer' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('sem gateway configurado responde 503 (não finge sucesso)', async () => {
    const app = await serverWith(undefined);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/invitations',
      payload: { email: 'x@y.com', role: 'viewer' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('auth_admin_unavailable');
    await app.close();
  });
});

describe('PC-07: fila de identidade no back-office', () => {
  it('lista o pendente com de→para (CPF mascarado) e aprovar aplica a mudança', async () => {
    const app = await serverWith(undefined);
    // um cliente (a equipe owner pode cadastrar e pedir)
    const cust = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'Ana',
          cpf: '153.509.460-56',
          birthDate: '2013-01-01',
          email: 'ana@ex.com',
          phone: '48999990000',
        },
      })
    ).json();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/portal/identity-change-requests',
      payload: { customerId: cust.id, fullName: 'Ana Prado', birthDate: '2012-06-06' },
    });
    expect(created.statusCode).toBe(201);
    const reqId = created.json().id;

    const list = await app.inject({ method: 'GET', url: '/v1/team/identity-change-requests' });
    expect(list.statusCode).toBe(200);
    const rows = list.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].current.fullName).toBe('Ana');
    expect(rows[0].current.cpf).toBe('153.***.***-56'); // SEC-04
    expect(rows[0].requested.fullName).toBe('Ana Prado');

    const decided = await app.inject({
      method: 'POST',
      url: `/v1/team/identity-change-requests/${reqId}/decision`,
      payload: { approve: true },
    });
    expect(decided.statusCode).toBe(200);
    expect(decided.json().status).toBe('approved');

    // aplicou no cliente e esvaziou a fila
    const after = await app.inject({ method: 'GET', url: '/v1/team/identity-change-requests' });
    expect(after.json()).toHaveLength(0);
    await app.close();
  });

  it('recusar arquiva sem aplicar; decidir de novo responde 400', async () => {
    const app = await serverWith(undefined);
    const cust = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: {
          fullName: 'Bruno',
          cpf: '277.373.070-44',
          birthDate: '1990-01-01',
          email: 'bruno@ex.com',
          phone: '48999990001',
        },
      })
    ).json();
    const reqId = (
      await app.inject({
        method: 'POST',
        url: '/v1/portal/identity-change-requests',
        payload: { customerId: cust.id, fullName: 'Nome Falso' },
      })
    ).json().id;

    const rej = await app.inject({
      method: 'POST',
      url: `/v1/team/identity-change-requests/${reqId}/decision`,
      payload: { approve: false, note: 'não confere' },
    });
    expect(rej.json().status).toBe('rejected');

    const again = await app.inject({
      method: 'POST',
      url: `/v1/team/identity-change-requests/${reqId}/decision`,
      payload: { approve: true },
    });
    expect(again.statusCode).toBe(400); // já decidido
    await app.close();
  });
});

/**
 * SEC — a resposta que carrega o link de acesso não é guardada por ninguém.
 *
 * O convite devolve `actionLink` no corpo: um magic link que **loga como a pessoa
 * convidada**. Isso é deliberado — sem SMTP configurado, é assim que a equipe entrega o
 * acesso à mão —, mas uma credencial num corpo de resposta não pode ficar em cache de
 * proxy, de CDN ou do próprio navegador.
 *
 * `no-store` é o que diz "não escreva isto em lugar nenhum", diferente de `no-cache`, que
 * permite guardar e só exige revalidar.
 */
describe('SEC: a resposta com link de acesso não vai para cache', () => {
  it('o convite de equipe responde com no-store', async () => {
    const app = await serverWith(inMemoryAuthAdmin());

    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/invitations',
      payload: { email: 'novo@drakkar.com', role: 'operator' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toContain('no-store');
    await app.close();
  });
});
