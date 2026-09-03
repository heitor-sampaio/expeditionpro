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
 * Relatórios do back-office. O fechamento por saída nunca teve teste de rota; nasce aqui
 * junto do de gastos por categoria, porque o que precisa ser provado é justamente que os
 * **dois somam o mesmo total de gastos** na mesma janela.
 */

const TEAM: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
let acting: RequestContext = TEAM;

describe('FO-06: rotas de relatório', () => {
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
    acting = TEAM;
  });
  afterAll(async () => {
    await app.close();
  });
  it('FO-06: devolve linhas por categoria e totais', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/reports/expenses-by-category' });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: unknown[]; totals: { contractedCents: number } };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.totals.contractedCents).toBe('number');
  });

  /** A promessa que os dois relatórios fazem: mesmo filtro, mesmo total de gastos. */
  it('FO-06: o total por categoria bate com o gasto do fechamento por saída', async () => {
    const query = '?from=2000-01-01&to=2100-12-31';
    const financeiro = (
      await app.inject({ method: 'GET', url: `/v1/reports/financial${query}` })
    ).json() as { totals: { expenseCents: number } };
    const porCategoria = (
      await app.inject({ method: 'GET', url: `/v1/reports/expenses-by-category${query}` })
    ).json() as { totals: { contractedCents: number } };

    expect(porCategoria.totals.contractedCents).toBe(financeiro.totals.expenseCents);
  });

  it('FO-06: data mal formada para na borda', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/reports/expenses-by-category?from=10/03/2026',
    });

    expect(res.statusCode).toBe(400);
  });

  it('FO-06: cliente não lê o relatório', async () => {
    acting = { tenantId: 'tenant-a', actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } };
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/reports/expenses-by-category' });
      expect(res.statusCode).toBe(403);
    } finally {
      acting = TEAM;
    }
  });
});
