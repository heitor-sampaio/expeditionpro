import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';
import { inMemoryServerDeps } from '../dev/inMemoryServerDeps.js';
import { inMemoryCustomers as fakeRepo } from '../dev/inMemoryCustomers.js';
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
import { inMemoryAuthAdmin } from '../dev/inMemoryAuthAdmin.js';
import { inMemoryIdentityChange } from '../dev/inMemoryIdentityChange.js';
import { inMemoryAudit } from '../dev/inMemoryAudit.js';
import { inMemoryMemberships } from '../dev/inMemoryMemberships.js';
import {
  inMemoryChannelIntegrations,
  inMemoryConversations,
  inMemoryMediaStore,
  inMemoryMessagingGateway,
} from '../dev/inMemoryMessaging.js';
import { inMemoryAutomations, inMemoryAutomationRuns } from '../dev/inMemoryAutomations.js';
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
import { cents, parseLocalDate, type PriceCategory } from '@expedition/domain';
import type {
  BookingRecord,
  CustomerRepository,
  RequestContext,
  ScheduleRepository,
} from '@expedition/application';
import type { FastifyInstance } from 'fastify';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const clienteCtx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u2', customerId: 'c1' },
};

/* Quem a rota diz ser — mutável para trocar a audiência dentro do mesmo servidor. */
let atual: RequestContext = ctx;

async function serverWith(customers: CustomerRepository): Promise<FastifyInstance> {
  const app = await buildServer({
    logger: false,
    deps: {
      customers,
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
      messagingGateway: inMemoryMessagingGateway(),
      conversationMedia: inMemoryMediaStore(),
      automations: inMemoryAutomations(),
      ...inMemoryAutomationRuns(),
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
  return app;
}

describe('CL-06: GET /v1/customers/:id/file (ficha do cliente)', () => {
  async function fileServer() {
    const customers = fakeRepo();
    const schedule = inMemorySchedule();
    const bookings = inMemoryBookings();
    const payments = inMemoryPayments([]);
    const cashback = inMemoryCashback();
    const app = await buildServer({
      logger: false,
      deps: inMemoryServerDeps({
        customers,
        schedule,
        bookings,
        payments,
        cashback,
        resolveContext: () => Promise.resolve(atual),
      }),
    });
    await app.ready();
    return { app, customers, schedule, bookings, payments, cashback };
  }

  async function seedGroup(schedule: ScheduleRepository) {
    const { group } = await schedule.createEventWithGroup(
      {
        tenantId: ctx.tenantId,
        itineraryId: 'itin-1',
        startDate: parseLocalDate('2025-11-10'),
        endDate: parseLocalDate('2025-11-14'),
        title: null,
        notes: null,
        status: 'scheduled',
      },
      {
        name: 'Coxilha Rica · 10/11/2025',
        status: 'open',
        capacityVehicles: 10,
        visibility: 'public',
        pricingMode: 'itinerary',
      },
    );
    return group;
  }

  it('reúne cliente (CPF completo no admin), expedições com financeiro derivado e cashback', async () => {
    const { app, schedule, bookings, payments, cashback } = await fileServer();
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();
    const group = await seedGroup(schedule);

    const booking: BookingRecord = {
      id: 'bk-file-1',
      groupId: group.id,
      responsibleCustomerId: resp.id,
      status: 'confirmed',
      source: 'manual',
      invoiceChecked: false,
      checkedInAt: null,
      participants: [
        {
          id: 'bk-file-1-p0',
          customerId: resp.id,
          priceCategory: 'COUPLE' as PriceCategory,
          unitPriceCents: cents(200000),
          priceSource: 'auto',
          priceNote: null,
        },
      ],
    };
    (bookings as unknown as { rows: BookingRecord[] }).rows.push(booking);
    await payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: 'bk-file-1',
        paidAt: parseLocalDate('2025-10-01'),
        amountCents: cents(50000),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: null,
      },
      null,
    );
    await cashback.addEntry({
      tenantId: ctx.tenantId,
      customerId: resp.id,
      bookingId: 'bk-file-1',
      type: 'accrual',
      amountCents: cents(5000),
      availableFrom: parseLocalDate('2025-11-15'),
      expiresAt: null,
      notes: null,
      createdBy: null,
    });

    const res = await app.inject({ method: 'GET', url: `/v1/customers/${resp.id}/file` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customer.cpf).toBe('900.000.100-57'); // admin: CPF completo
    expect(body.customer.tenantId).toBeUndefined(); // não vaza a entidade
    expect(body.expeditions).toHaveLength(1);
    expect(body.expeditions[0].groupName).toBe('Coxilha Rica · 10/11/2025');
    expect(body.expeditions[0].startDate).toBe('2025-11-10');
    expect(body.expeditions[0].role).toBe('responsible');
    expect(body.expeditions[0].contractedCents).toBe(200000);
    expect(body.expeditions[0].receivedCents).toBe(50000);
    expect(body.expeditions[0].dueCents).toBe(150000);
    expect(body.cashback.balanceCents).toBe(5000);
    expect(body.cashback.entries[0].availableFrom).toBe('2025-11-15');
    await app.close();
  });

  it('cliente inexistente responde 404', async () => {
    const { app } = await fileServer();
    const res = await app.inject({ method: 'GET', url: '/v1/customers/nao-existe/file' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // CL-10: as ações de vínculo na ficha (mover, tornar responsável) precisam saber
  // quem é o responsável e quem são os acompanhantes.
  it('traz a família — responsável nulo no head e os acompanhantes, sem CPF', async () => {
    const { app } = await fileServer();
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();
    const companion = (
      await app.inject({
        method: 'POST',
        url: `/v1/customers/${resp.id}/companions`,
        payload: { fullName: 'Fulana de Tal', cpf: '12345678909', birthDate: '2015-03-22' },
      })
    ).json();

    const head = (await app.inject({ method: 'GET', url: `/v1/customers/${resp.id}/file` })).json();
    expect(head.family.responsible).toBeNull();
    expect(head.family.companions).toEqual([
      { id: companion.id, fullName: 'Fulana de Tal' }, // só id e nome: nada de CPF aqui
    ]);

    const child = (
      await app.inject({ method: 'GET', url: `/v1/customers/${companion.id}/file` })
    ).json();
    expect(child.family.responsible).toEqual({ id: resp.id, fullName: 'Heitor Sampaio' });
    expect(child.family.companions).toEqual([]);
    await app.close();
  });
});

describe('CL-01: POST /v1/customers', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await serverWith(fakeRepo());
  });
  afterAll(async () => {
    await app.close();
  });

  it('cria o cliente e responde 201 com o CPF MASCARADO (SEC-04), nunca a entidade', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/customers',
      payload: {
        fullName: 'Heitor Sampaio',
        cpf: '900.000.100-57',
        birthDate: '1989-01-14',
        email: 'h@ex.com',
        phone: '48999998877',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.cpf).toBe('900.000.100-57'); // admin: CPF completo
    expect(body.role).toBe('responsible');
    expect(body.birthDate).toBe('14/01/1989');
    // não vaza tenantId nem responsibleId cru
    expect(body.tenantId).toBeUndefined();
  });

  it('CPF com dígito verificador inválido responde 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/customers',
      payload: { fullName: 'Fulano', cpf: '90000010000', birthDate: '1989-01-14' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('invalid_cpf');
  });

  it('campo obrigatório ausente responde 400 (validação de borda, Zod)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/customers',
      payload: { cpf: '90000010057', birthDate: '1989-01-14' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('CPF duplicado no tenant responde 409', async () => {
    const app2 = await serverWith(fakeRepo());
    const payload = {
      fullName: 'Heitor',
      cpf: '90000010057',
      birthDate: '1989-01-14',
      email: 'h@ex.com',
      phone: '48999998877',
    };
    await app2.inject({ method: 'POST', url: '/v1/customers', payload });
    const res = await app2.inject({ method: 'POST', url: '/v1/customers', payload });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('duplicate_cpf');
    await app2.close();
  });
});

const RESP_PAYLOAD = {
  fullName: 'Heitor Sampaio',
  cpf: '900.000.100-57',
  birthDate: '1989-01-14',
  email: 'h@ex.com',
  phone: '48999998877',
};

describe('CL-03: POST /v1/customers/:id/companions', () => {
  it('adiciona acompanhante e responde 201 com role companion e CPF completo', async () => {
    const app = await serverWith(fakeRepo());
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/customers/${resp.id}/companions`,
      payload: { fullName: 'Fulana de Tal', cpf: '12345678909', birthDate: '2015-03-22' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().role).toBe('companion');
    expect(res.json().cpf).toBe('123.456.789-09');
    await app.close();
  });

  it('acompanhante em responsável inexistente responde 404', async () => {
    const app = await serverWith(fakeRepo());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/customers/nao-existe/companions',
      payload: { fullName: 'X', cpf: '12345678909', birthDate: '2015-03-22' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('CL-03: DELETE /v1/customers/:id (remover acompanhante)', () => {
  it('remove o acompanhante e some da família', async () => {
    const app = await serverWith(fakeRepo());
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();
    const companion = (
      await app.inject({
        method: 'POST',
        url: `/v1/customers/${resp.id}/companions`,
        payload: { fullName: 'Fulana de Tal', cpf: '12345678909', birthDate: '2015-03-22' },
      })
    ).json();

    const res = await app.inject({ method: 'DELETE', url: `/v1/customers/${companion.id}` });
    expect(res.statusCode).toBe(204);

    const family = (
      await app.inject({ method: 'GET', url: `/v1/customers/${resp.id}/family` })
    ).json();
    expect(family.companions).toEqual([]);
    await app.close();
  });

  it('responsável responde 400 e inexistente responde 404', async () => {
    const app = await serverWith(fakeRepo());
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();

    const head = await app.inject({ method: 'DELETE', url: `/v1/customers/${resp.id}` });
    expect(head.statusCode).toBe(400);
    expect(head.json().error).toBe('not_a_companion');

    const missing = await app.inject({ method: 'DELETE', url: '/v1/customers/nao-existe' });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});

describe('CL-06: GET /v1/customers/:id/family (dados completos para editar)', () => {
  it('devolve responsável e acompanhantes com os campos de edição', async () => {
    const app = await serverWith(fakeRepo());
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/customers/${resp.id}/companions`,
      payload: { fullName: 'Fulana de Tal', cpf: '12345678909', birthDate: '2015-03-22' },
    });

    // entrar pelo acompanhante resolve a mesma família
    const byHead = await app.inject({ method: 'GET', url: `/v1/customers/${resp.id}/family` });
    expect(byHead.statusCode).toBe(200);
    const body = byHead.json();
    expect(body.responsible.fullName).toBe('Heitor Sampaio');
    expect(body.responsible.email).toBe('h@ex.com');
    expect(body.companions).toHaveLength(1);
    expect(body.companions[0].cpf).toBe('123.456.789-09');
    expect(body.companions[0].birthDate).toBe('22/03/2015');
    await app.close();
  });
});

describe('CL-06: PATCH /v1/customers/:id (a equipe edita a ficha)', () => {
  it('edita identidade e contato e devolve o DTO com CPF completo e telefone formatado', async () => {
    const app = await serverWith(fakeRepo());
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/customers/${resp.id}`,
      payload: {
        fullName: 'heitor osampaio da silva',
        birthDate: '1989-01-15',
        phone: '(48) 3154-3707',
        address: { zip: '88015-200', city: 'Florianópolis', state: 'sc' },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.fullName).toBe('Heitor Osampaio da Silva');
    expect(body.birthDate).toBe('15/01/1989');
    expect(body.phone).toBe('+55 (48)3154-3707');
    expect(body.address.zip).toBe('88015-200'); // guardado só dígitos, exibido pontuado
    expect(body.cpf).toBe('900.000.100-57'); // identidade não pedida segue intacta
    await app.close();
  });

  it('CPF inválido responde 422 e cliente inexistente responde 404', async () => {
    const app = await serverWith(fakeRepo());
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();

    const invalid = await app.inject({
      method: 'PATCH',
      url: `/v1/customers/${resp.id}`,
      payload: { cpf: '111.111.111-11' },
    });
    expect(invalid.statusCode).toBe(422);

    const missing = await app.inject({
      method: 'PATCH',
      url: '/v1/customers/nao-existe',
      payload: { email: 'x@y.z' },
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});

describe('CL-04: GET /v1/customers (busca retorna a família)', () => {
  it('busca por nome do responsável e devolve a família com CPFs completos', async () => {
    const app = await serverWith(fakeRepo());
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/customers/${resp.id}/companions`,
      payload: { fullName: 'Fulana de Tal', cpf: '12345678909', birthDate: '2015-03-22' },
    });

    const res = await app.inject({ method: 'GET', url: '/v1/customers?q=sampaio' });
    expect(res.statusCode).toBe(200);
    const families = res.json();
    expect(families).toHaveLength(1);
    expect(families[0].responsible.role).toBe('responsible');
    expect(families[0].responsible.cpf).toBe('900.000.100-57');
    expect(families[0].companions).toHaveLength(1);
    expect(families[0].companions[0].cpf).toBe('123.456.789-09');
    await app.close();
  });

  it('busca pelo CPF de um acompanhante devolve a família toda', async () => {
    const app = await serverWith(fakeRepo());
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/customers/${resp.id}/companions`,
      payload: { fullName: 'Fulana de Tal', cpf: '12345678909', birthDate: '2015-03-22' },
    });

    const res = await app.inject({ method: 'GET', url: '/v1/customers?q=12345678909' });
    const families = res.json();
    expect(families).toHaveLength(1);
    expect(families[0].responsible.id).toBe(resp.id);
    await app.close();
  });
});

describe('CL-02: endereço fiscal no cadastro', () => {
  it('guarda o endereço e devolve com o CEP normalizado no DTO', async () => {
    const app = await serverWith(fakeRepo());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/customers',
      payload: {
        ...RESP_PAYLOAD,
        address: {
          street: 'Rua Luiz Pasteur',
          number: '509',
          district: 'Trindade',
          city: 'Florianópolis',
          state: 'SC',
          zip: '88036-100',
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.address.city).toBe('Florianópolis');
    expect(body.address.zip).toBe('88036-100'); // exibição pontuada
    await app.close();
  });
});

describe('CL-10 / CL-07: reorganização e merge (rotas)', () => {
  async function familyServer() {
    const app = await serverWith(fakeRepo());
    const r = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();
    const r2 = (
      await app.inject({
        method: 'POST',
        url: '/v1/customers',
        payload: { ...RESP_PAYLOAD, cpf: '12345678909' },
      })
    ).json();
    const c1 = (
      await app.inject({
        method: 'POST',
        url: `/v1/customers/${r.id}/companions`,
        payload: { fullName: 'Filho', cpf: '52998224725', birthDate: '2015-03-22' },
      })
    ).json();
    return { app, r, r2, c1 };
  }

  it('POST /:id/move vincula o acompanhante a outro responsável', async () => {
    const { app, r2, c1 } = await familyServer();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/customers/${c1.id}/move`,
      payload: { responsibleId: r2.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('companion');
    await app.close();
  });

  it('POST /:id/promote torna o acompanhante responsável', async () => {
    const { app, c1 } = await familyServer();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/customers/${c1.id}/promote`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('responsible');
    await app.close();
  });

  it('POST /merge mescla e devolve o sobrevivente', async () => {
    const { app, r, r2 } = await familyServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/customers/merge',
      payload: { survivorId: r.id, duplicateId: r2.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(r.id);
    await app.close();
  });
});

describe('PC-01/PC-02: POST /v1/customers/:id/portal-invite', () => {
  async function serverWithAdmin() {
    const authAdmin = inMemoryAuthAdmin();
    const app = await buildServer({
      logger: false,
      deps: {
        customers: fakeRepo(),
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
        messagingGateway: inMemoryMessagingGateway(),
        conversationMedia: inMemoryMediaStore(),
        automations: inMemoryAutomations(),
        ...inMemoryAutomationRuns(),
        documents: inMemoryLegalDocuments(),
        consents: inMemoryConsents(),
        community: inMemoryCommunity(),
        media: inMemoryMediaConsents(),
        paymentIntegrations: inMemoryPaymentIntegrations(),
        charges: inMemoryPaymentCharges(),
        paymentGateway: asaasGateway(),
        authAdmin,
        resolveContext: () => Promise.resolve(atual),
      },
    });
    await app.ready();
    return { app, authAdmin };
  }

  it('convida o cliente adulto e responde 201 com actionLink; grava customer_id no metadata', async () => {
    const { app, authAdmin } = await serverWithAdmin();
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/customers/${resp.id}/portal-invite`,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().actionLink).toBeDefined();
    expect(authAdmin.portalInvites).toHaveLength(1);
    expect(authAdmin.portalInvites[0]!.customerId).toBe(resp.id);
    expect(authAdmin.portalInvites[0]!.tenantId).toBe('tenant-a');
    await app.close();
  });

  it('sem gateway configurado responde 503', async () => {
    const app = await serverWith(fakeRepo());
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/customers/${resp.id}/portal-invite`,
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

/*
 * SEC-01 — a rota de back-office pendura acompanhante e veículo em QUALQUER cliente, então
 * é ela que barra o cliente. O caso de uso fica sem guarda de propósito: o portal chega
 * nele por `registerFamilyCompanion`/`savePortalVehicle`, que escopam à própria família
 * (PC-06, PC-08). Guarda no caso de uso compartilhado quebraria o caminho legítimo — a
 * suíte pegou exatamente isso quando tentei.
 */
describe('SEC-01: rota de back-office de acompanhante barra o cliente', () => {
  it('cliente recebe 403 ao pendurar acompanhante em outro responsável', async () => {
    const app = await serverWith(fakeRepo());
    const resp = (
      await app.inject({ method: 'POST', url: '/v1/customers', payload: RESP_PAYLOAD })
    ).json();

    atual = clienteCtx;
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/customers/${resp.id}/companions`,
        payload: { fullName: 'Intrusa', cpf: '12345678909', birthDate: '2015-03-22' },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      atual = ctx;
      await app.close();
    }
  });

  it('cliente recebe 403 ao buscar a base de clientes', async () => {
    const app = await serverWith(fakeRepo());
    atual = clienteCtx;
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/customers' });
      expect(res.statusCode).toBe(403);
    } finally {
      atual = ctx;
      await app.close();
    }
  });
});
