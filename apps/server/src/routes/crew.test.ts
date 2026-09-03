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

/**
 * CF-05 — as rotas do condutor da empresa (Configurações → Equipe).
 *
 * O caso de uso já tem os seus testes; o que falta cobrir é a **borda**: o schema Zod que
 * decide o que sequer chega ao domínio. Um regex de data escrito errado aqui recusa todo
 * cadastro válido com um 422 genérico, sem que nenhum teste de domínio perceba.
 */

const ADMIN: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
let acting: RequestContext = ADMIN;

function lead(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Heitor de Oliveira Sampaio',
    cpf: '900.000.100-57',
    birthDate: '1989-01-14',
    email: 'heitorosampaio@gmail.com',
    phone: '(48) 99999-8877',
    address: {
      street: 'Rua Luiz Pasteur',
      number: '509',
      district: 'Trindade',
      city: 'Florianópolis',
      state: 'SC',
      zip: '88036-100',
    },
    vehicle: { brand: 'Ford', model: 'Ranger', plate: 'SFG1H00' },
    companions: [
      { fullName: 'Vanessa Marek Campesatto', birthDate: '1983-03-30' },
      { fullName: 'Enzo Sampaio', birthDate: '2018-08-02' },
    ],
    ...overrides,
  };
}

describe('CF-05: GET e PUT /v1/crew', () => {
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
        resolveContext: () => Promise.resolve(acting),
      },
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    acting = ADMIN;
  });

  it('sem condutor cadastrado, a leitura devolve nulo', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/crew' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });

  it('salva o condutor e devolve as datas em ISO, como o campo de data da tela fala', async () => {
    const res = await app.inject({ method: 'PUT', url: '/v1/crew', payload: lead() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      birthDate: '1989-01-14',
      vehicle: { brand: 'Ford', model: 'Ranger', plate: 'SFG1H00' },
      companions: [
        { fullName: 'Vanessa Marek Campesatto', birthDate: '1983-03-30' },
        { fullName: 'Enzo Sampaio', birthDate: '2018-08-02' },
      ],
    });
  });

  /**
   * O DTO do back-office pontua CPF, telefone e CEP — mesmo contrato de `/v1/customers`.
   * O formulário devolve o que a rota mandou, então DTO cru significa o usuário vendo
   * `90000010057` no campo depois de salvar `900.000.100-57`.
   */
  it('devolve CPF, telefone e CEP pontuados, como o resto do back-office devolve', async () => {
    const res = await app.inject({ method: 'PUT', url: '/v1/crew', payload: lead() });

    expect(res.json()).toMatchObject({
      cpf: '900.000.100-57',
      phone: '+55 (48)99999-8877',
      address: { zip: '88036-100' },
    });
  });

  it('o que foi salvo volta na leitura', async () => {
    await app.inject({ method: 'PUT', url: '/v1/crew', payload: lead() });

    const res = await app.inject({ method: 'GET', url: '/v1/crew' });

    expect(res.json()).toMatchObject({ birthDate: '1989-01-14', cpf: '900.000.100-57' });
  });

  it('data fora do formato ISO para na borda', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/crew',
      payload: lead({ birthDate: '14/01/1989' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('cliente não lê o condutor — 403', async () => {
    acting = { tenantId: 'tenant-a', actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } };
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/crew' });
      expect(res.statusCode).toBe(403);
    } finally {
      acting = ADMIN;
    }
  });

  it('operator não salva o condutor — 403', async () => {
    acting = { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u2', role: 'operator' } };
    try {
      const res = await app.inject({ method: 'PUT', url: '/v1/crew', payload: lead() });
      expect(res.statusCode).toBe(403);
    } finally {
      acting = ADMIN;
    }
  });
});
