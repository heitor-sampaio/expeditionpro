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
  inMemoryMessagingGateway,
} from '../dev/inMemoryMessaging.js';
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

async function newCustomer(
  app: FastifyInstance,
  cpf: string,
  birthDate: string,
  responsibleId?: string,
) {
  const url = responsibleId ? `/v1/customers/${responsibleId}/companions` : '/v1/customers';
  const res = await app.inject({
    method: 'POST',
    url,
    payload: { fullName: `P ${cpf}`, cpf, birthDate, email: 'a@b.com', phone: '48999999999' },
  });
  return res.json().id as string;
}

describe('GR-03/IN-18: POST /v1/groups/:groupId/bookings', () => {
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
        coupons: inMemoryCoupons(),
        identityRequests: inMemoryIdentityChange(),
        audit: inMemoryAudit(),
        memberships: inMemoryMemberships(),
        opportunities: inMemoryOpportunities(),
        channelIntegrations: inMemoryChannelIntegrations(),
        conversations: inMemoryConversations(),
        messagingGateway: inMemoryMessagingGateway(),
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
    const itin = (
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
        payload: { itineraryId: itin.id, startDate: '2025-11-10', endDate: '2025-11-14' },
      })
    ).json();
    groupId = event.group.id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('aloca a família, congela o snapshot e responde 201 com total derivado', async () => {
    const resp = await newCustomer(app, '90000010057', '1989-01-14');
    const cony = await newCustomer(app, '11144477735', '1990-05-20', resp);
    const kid = await newCustomer(app, '52998224725', '2021-01-01', resp);

    const res = await app.inject({
      method: 'POST',
      url: `/v1/groups/${groupId}/bookings`,
      payload: { responsibleCustomerId: resp, participantCustomerIds: [resp, cony, kid] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('pending');
    expect(body.totalCents).toBe(240000);
    const cats = body.participants.map((p: { priceCategory: string }) => p.priceCategory).sort();
    expect(cats).toEqual(['CHILD_YOUNG', 'COUPLE', 'COUPLE']);
  });

  it('IN-02: segunda inscrição do mesmo responsável responde 400', async () => {
    const resp = await newCustomer(app, '39053344705', '1989-01-14');
    const payload = { responsibleCustomerId: resp, participantCustomerIds: [resp] };
    await app.inject({ method: 'POST', url: `/v1/groups/${groupId}/bookings`, payload });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/groups/${groupId}/bookings`,
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('already_allocated');
  });

  it('AG-08: aloca em grupo de preço manual com valor livre, sem categorias', async () => {
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Pacote Fechado', prices: PRICE },
      })
    ).json();
    const event = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: {
          itineraryId: itin.id,
          startDate: '2025-12-10',
          endDate: '2025-12-14',
          pricingMode: 'manual',
        },
      })
    ).json();
    const resp = await newCustomer(app, '85073844556', '1989-01-14');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/groups/${event.group.id}/manual-bookings`,
      payload: { responsibleCustomerId: resp, participantCustomerIds: [resp], totalCents: 350000 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('pending');
    expect(body.totalCents).toBe(350000);
    expect(body.participants[0].priceCategory).toBe('MANUAL');
  });

  it('GR-04: desconto em percentual derruba o total e marca override em cada linha', async () => {
    const resp = await newCustomer(app, '15350946056', '1989-01-14');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/discount`,
      payload: { reason: 'cortesia acertada', mode: 'percent', value: 10 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalCents).toBe(Math.floor(booking.totalCents * 0.9));
    expect(body.participants[0].priceSource).toBe('override');
    expect(body.participants[0].priceNote).toBe('cortesia acertada');
  });

  it('GR-04: desconto em reais abate exatamente o que foi pedido', async () => {
    const resp = await newCustomer(app, '01000000028', '1989-01-14');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/discount`,
      payload: { reason: 'negociado', mode: 'fixed', value: 10000 },
    });

    expect(res.json().totalCents).toBe(booking.totalCents - 10000);
  });

  it('GR-04: restaurar devolve a inscrição ao preço de tabela', async () => {
    const resp = await newCustomer(app, '02000000045', '1989-01-14');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/discount`,
      payload: { reason: 'errei', mode: 'percent', value: 10 },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/restore-price`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().totalCents).toBe(booking.totalCents);
    expect(res.json().participants[0].priceSource).toBe('auto');
  });

  it('GR-04: inscrição no preço de tabela não tem o que restaurar', async () => {
    const resp = await newCustomer(app, '02000000126', '1989-01-14');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/restore-price`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'nothing_to_restore' });
  });

  it('GR-04: motivo em branco responde 400', async () => {
    const resp = await newCustomer(app, '27737307044', '1989-01-14');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/discount`,
      payload: { reason: '', mode: 'percent', value: 10 },
    });
    expect(res.statusCode).toBe(400); // Zod barra reason vazio na borda
  });

  it('GR-07/GR-13: a leitura do grupo devolve linhas e totais confirmado/projetado', async () => {
    // grupo próprio para isolar os totais
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Board Rica', prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2025-12-01', endDate: '2025-12-05' },
      })
    ).json();
    const gid = ev.group.id;

    const resp = await newCustomer(app, '50040030091', '1989-01-14');
    await app.inject({
      method: 'POST',
      url: `/v1/groups/${gid}/bookings`,
      payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
    });

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${gid}/board` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.group.startDate).toBe('2025-12-01');
    // AG-04/AG-05: editar e excluir a saída partem do evento, não do grupo
    expect(body.group.scheduleEventId).toBeTruthy();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].responsibleName).toBe('P 50040030091'); // enriquecido com o nome
    // inscrição nasce pending → projetado > confirmado
    expect(body.totals.contractedProjectedCents).toBe(120000);
    expect(body.totals.contractedConfirmedCents).toBe(0);
    expect(body.totals.pendingCount).toBe(1);
    expect(body.occupancy.occupiedVehicles).toBe(0); // pendente não ocupa
  });

  it('leitura de grupo inexistente responde 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/groups/fantasma/board' });
    expect(res.statusCode).toBe(404);
  });

  it('IN-08: recebimento confirma a inscrição e o board passa a contar como confirmado/recebido', async () => {
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Pay Rica', prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2026-01-10', endDate: '2026-01-14' },
      })
    ).json();
    const gid = ev.group.id;
    const resp = await newCustomer(app, '70060050004', '1989-01-14');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${gid}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();

    const pay = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/payments`,
      payload: { amountCents: 50000, method: 'pix', paidAt: '2026-01-05' },
    });
    expect(pay.statusCode).toBe(201);
    expect(pay.json().confirmedNow).toBe(true);

    const board = (await app.inject({ method: 'GET', url: `/v1/groups/${gid}/board` })).json();
    expect(board.totals.contractedConfirmedCents).toBe(120000); // agora confirmado
    expect(board.totals.receivedCents).toBe(50000);
    expect(board.totals.dueConfirmedCents).toBe(70000);
    expect(board.occupancy.occupiedVehicles).toBe(1); // confirmada ocupa
  });

  it('IN-10/IN-16: confirma manual sem pagamento e depois cancela (recebimento intacto)', async () => {
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Life Rica', prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2026-02-10', endDate: '2026-02-14' },
      })
    ).json();
    const gid = ev.group.id;
    const resp = await newCustomer(app, '81071061054', '1989-01-14');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${gid}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();

    // IN-10: confirma sem pagamento, motivo obrigatório
    const conf = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/confirm`,
      payload: { note: 'cortesia do guia' },
    });
    expect(conf.statusCode).toBe(200);
    expect(conf.json().status).toBe('confirmed');

    // motivo vazio → 400 (Zod)
    const bad = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/confirm`,
      payload: { note: '' },
    });
    expect(bad.statusCode).toBe(400);

    // cancela com motivo
    const cancel = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/cancel`,
      payload: { reason: 'cliente desistiu' },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe('cancelled');
  });

  it('IN-11: excluir o único recebimento não reverte o status e pede decisão', async () => {
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Del Rica', prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2026-03-10', endDate: '2026-03-14' },
      })
    ).json();
    const resp = await newCustomer(app, '92082072002', '1989-01-14');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${ev.group.id}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();
    const pay = (
      await app.inject({
        method: 'POST',
        url: `/v1/bookings/${booking.id}/payments`,
        payload: { amountCents: 40000, method: 'pix', paidAt: '2026-03-01' },
      })
    ).json();

    const del = await app.inject({ method: 'DELETE', url: `/v1/payments/${pay.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json().remainingPayments).toBe(0);
    expect(del.json().bookingStatus).toBe('confirmed'); // não reverteu
    expect(del.json().requiresDecision).toBe(true);
  });

  it('IN-11: GET /v1/bookings/:id/payments lista os recebimentos e some após excluir', async () => {
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'Lista Rica', prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2026-04-10', endDate: '2026-04-14' },
      })
    ).json();
    const resp = await newCustomer(app, '12045078051', '1989-01-14');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${ev.group.id}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();
    const pay = (
      await app.inject({
        method: 'POST',
        url: `/v1/bookings/${booking.id}/payments`,
        payload: { amountCents: 40000, method: 'pix', paidAt: '2026-04-01' },
      })
    ).json();

    const before = await app.inject({ method: 'GET', url: `/v1/bookings/${booking.id}/payments` });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toHaveLength(1);
    expect(before.json()[0].amountCents).toBe(40000);

    await app.inject({ method: 'DELETE', url: `/v1/payments/${pay.id}` });
    const after = await app.inject({ method: 'GET', url: `/v1/bookings/${booking.id}/payments` });
    expect(after.json()).toHaveLength(0);
  });

  it('GR-06: marca a NF (com número) e o board passa a mostrar invoiceChecked', async () => {
    const itin = (
      await app.inject({
        method: 'POST',
        url: '/v1/itineraries',
        payload: { name: 'NF Rica', prices: PRICE },
      })
    ).json();
    const ev = (
      await app.inject({
        method: 'POST',
        url: '/v1/schedule-events',
        payload: { itineraryId: itin.id, startDate: '2026-05-10', endDate: '2026-05-14' },
      })
    ).json();
    const resp = await newCustomer(app, '33022011091', '1989-01-14');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${ev.group.id}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();

    const mark = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/invoice`,
      payload: { checked: true, invoiceNumber: 'NF-42', issuedAt: '2026-05-01' },
    });
    expect(mark.statusCode).toBe(200);
    expect(mark.json().checked).toBe(true);
    expect(mark.json().invoiceNumber).toBe('NF-42');
    expect(mark.json().invoiceIssuedAt).toBe('2026-05-01');

    const board = (
      await app.inject({ method: 'GET', url: `/v1/groups/${ev.group.id}/board` })
    ).json();
    expect(board.rows[0].invoiceChecked).toBe(true);
  });

  it('IN-09: operator não lança recebimento (403)', async () => {
    // servidor com ator operator
    const bookings = inMemoryBookings();
    const opApp = await buildServer({
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
        channelIntegrations: inMemoryChannelIntegrations(),
        conversations: inMemoryConversations(),
        messagingGateway: inMemoryMessagingGateway(),
        documents: inMemoryLegalDocuments(),
        consents: inMemoryConsents(),
        community: inMemoryCommunity(),
        media: inMemoryMediaConsents(),
        paymentIntegrations: inMemoryPaymentIntegrations(),
        charges: inMemoryPaymentCharges(),
        paymentGateway: asaasGateway(),
        resolveContext: () =>
          Promise.resolve({
            tenantId: 'tenant-a',
            actor: { kind: 'team', userId: 'u9', role: 'operator' },
          }),
      },
    });
    await opApp.ready();
    const res = await opApp.inject({
      method: 'POST',
      url: '/v1/bookings/qualquer/payments',
      payload: { amountCents: 1000, method: 'pix', paidAt: '2026-01-05' },
    });
    expect(res.statusCode).toBe(403);
    await opApp.close();
  });

  it('§3.6: devolve em dinheiro — recebido líquido cai no board', async () => {
    const resp = await newCustomer(app, '11234567806', '1988-03-04');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/payments`,
      payload: { amountCents: 120000, method: 'pix', paidAt: '2026-08-01' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/refunds`,
      payload: {
        amountCents: 20000,
        destination: 'cash',
        method: 'pix',
        paidAt: '2026-08-27',
        reason: 'Saída cancelada',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().netReceivedCents).toBe(100000);
    expect(res.json().bookingCancelled).toBe(false);

    const payments = (
      await app.inject({ method: 'GET', url: `/v1/bookings/${booking.id}/payments` })
    ).json();
    expect(
      payments.some(
        (p: { kind: string; amountCents: number }) =>
          p.kind === 'refund' && p.amountCents === -20000,
      ),
    ).toBe(true);
  });

  it('§3.6: conversão integral em cashback cancela a inscrição; acima do recebido é 400', async () => {
    const resp = await newCustomer(app, '11358024596', '1988-03-04');
    const booking = (
      await app.inject({
        method: 'POST',
        url: `/v1/groups/${groupId}/bookings`,
        payload: { responsibleCustomerId: resp, participantCustomerIds: [resp] },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/payments`,
      payload: { amountCents: 120000, method: 'pix', paidAt: '2026-08-01' },
    });

    const tooMuch = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/refunds`,
      payload: {
        amountCents: 120001,
        destination: 'cash',
        method: 'pix',
        paidAt: '2026-08-27',
        reason: 'x',
      },
    });
    expect(tooMuch.statusCode).toBe(400);
    expect(tooMuch.json().error).toBe('refund_exceeds_received');

    const full = await app.inject({
      method: 'POST',
      url: `/v1/bookings/${booking.id}/refunds`,
      payload: {
        amountCents: 120000,
        destination: 'cashback',
        paidAt: '2026-08-27',
        reason: 'Virou crédito',
      },
    });
    expect(full.statusCode).toBe(201);
    expect(full.json().bookingCancelled).toBe(true);
  });

  it('SEC-01: cliente recebe 403 no ledger de recebimentos de uma inscrição', async () => {
    atual = clienteCtx;
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/bookings/qualquer/payments' });
      expect(res.statusCode).toBe(403);
    } finally {
      atual = ctx;
    }
  });
});
