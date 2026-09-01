import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakePaymentChargeRepository } from './paymentChargeRepository.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { listBookingCharges } from './listBookingCharges.js';
import { listRecentCharges } from './listRecentCharges.js';
import { reconcileCharge } from './reconcileCharge.js';
import { fakePaymentGateway } from './paymentGateway.fake.js';
import { fakePaymentIntegrationRepository } from './paymentIntegrationRepository.fake.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

/**
 * PG-06 — toda cobrança emitida fica registrada em dois lugares: na **inscrição**, para
 * quem atende a família, e no **financeiro**, para quem olha a empresa.
 *
 * Bruto e líquido aparecem lado a lado. A diferença é a taxa do provedor — informação,
 * não despesa (decisão do dono do produto): o que importa é o que foi cobrado e o que
 * foi recebido.
 */

const equipe: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

async function seed() {
  const charges = fakePaymentChargeRepository();
  const bookings = fakeBookingRepository();
  const customers = fakeCustomerRepository();
  const schedule = fakeScheduleRepository();

  const head = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Vanessa Santos',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1990-03-04'),
    email: 'vanessa@example.com',
    phone: '5548999990000',
    address: EMPTY_ADDRESS,
  });

  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: 'tenant-a',
      itineraryId: 'itin-1',
      startDate: parseLocalDate('2026-11-10'),
      endDate: parseLocalDate('2026-11-14'),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: 'Coxilha Rica · 10/11',
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );

  const booking = await bookings.create({
    tenantId: 'tenant-a',
    groupId: group.id,
    responsibleCustomerId: head.id,
    status: 'pending',
    source: 'portal',
    participants: [],
  });

  await charges.create({
    tenantId: 'tenant-a',
    bookingId: booking.id,
    provider: 'asaas',
    environment: 'sandbox',
    externalId: 'pay_1',
    installmentExternalId: null,
    amountCents: cents(227826),
    netAmountCents: cents(208000),
    installments: 6,
    billingType: 'CREDIT_CARD',
    dueDate: parseLocalDate('2026-09-05'),
    status: 'pending',
    invoiceUrl: 'https://sandbox.asaas.com/i/pay_1',
    createdBy: 'u1',
  });

  return { charges, bookings, customers, schedule, booking, head, group };
}

describe('PG-06: as cobranças da inscrição', () => {
  it('lista o que foi cobrado, o que deve sobrar e a taxa entre os dois', async () => {
    const s = await seed();
    const rows = await listBookingCharges({ charges: s.charges }, equipe, {
      bookingId: s.booking.id,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amountCents: 227826,
      netAmountCents: 208000,
      feeCents: 19826,
      installments: 6,
      billingType: 'CREDIT_CARD',
      status: 'pending',
    });
  });

  it('é leitura da equipe — o cliente não lê cobrança pelo sistema', async () => {
    const s = await seed();
    const cliente: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: s.head.id, userId: 'user-1' },
    };
    await expect(
      listBookingCharges({ charges: s.charges }, cliente, { bookingId: s.booking.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('PG-06: as cobranças no financeiro da empresa', () => {
  it('traz as últimas com a família e a saída, para a linha se explicar sozinha', async () => {
    const s = await seed();
    const rows = await listRecentCharges(
      { charges: s.charges, bookings: s.bookings, customers: s.customers, schedule: s.schedule },
      equipe,
      { limit: 20 },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      responsibleName: 'Vanessa Santos',
      groupName: 'Coxilha Rica · 10/11',
      amountCents: 227826,
      netAmountCents: 208000,
      feeCents: 19826,
    });
  });

  it('cobrança de inscrição apagada não derruba a lista — mostra o que dá', async () => {
    const s = await seed();
    s.bookings.rows.length = 0;
    const rows = await listRecentCharges(
      { charges: s.charges, bookings: s.bookings, customers: s.customers, schedule: s.schedule },
      equipe,
      { limit: 20 },
    );
    expect(rows[0]!.responsibleName).toBe('—');
  });

  it('é leitura da equipe', async () => {
    const s = await seed();
    const cliente: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: s.head.id, userId: 'user-1' },
    };
    await expect(
      listRecentCharges(
        { charges: s.charges, bookings: s.bookings, customers: s.customers, schedule: s.schedule },
        cliente,
        { limit: 20 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/**
 * PG-07 — conciliação: o que o provedor **de fato** creditou, ao lado do que se esperava.
 * É o que responde "depois da antecipação, quanto entrou mesmo?".
 */
describe('PG-07: conciliar a cobrança com o que caiu na conta', () => {
  async function conciliavel() {
    const s = await seed();
    const gateway = fakePaymentGateway();
    const integrations = fakePaymentIntegrationRepository();
    await integrations.upsert({
      tenantId: 'tenant-a',
      provider: 'asaas',
      environment: 'sandbox',
      accessToken: 'aact_valida',
      webhookTokenHash: 'hash-do-whk',
      accountName: 'Drakkar',
      connectedBy: 'u1',
      connectedAt: new Date('2026-08-28T10:00:00.000Z'),
    });
    const charge = s.charges.rows[0]!;
    return { s, gateway, integrations, charge };
  }

  const deps = (x: Awaited<ReturnType<typeof conciliavel>>) => ({
    charges: x.s.charges,
    integrations: x.integrations,
    gateway: x.gateway,
    clock: () => new Date('2026-09-10T12:00:00.000Z'),
  });

  it('guarda o pago e o creditado, com o custo da antecipação à parte', async () => {
    const x = await conciliavel();
    x.gateway.settlements.set(x.charge.externalId, {
      paidCents: 227826,
      creditedCents: 208000,
      awaitingCreditCents: 0,
      paidInstallments: 6,
      creditedInstallments: 6,
      totalInstallments: 6,
      anticipationFeeCents: 14100,
      nextCreditDate: null,
      installmentExternalId: null,
    });

    const conciliada = await reconcileCharge(deps(x), equipe, { chargeId: x.charge.id });

    expect(conciliada.settledGrossCents).toBe(227826);
    expect(conciliada.settledNetCents).toBe(208000);
    expect(conciliada.anticipationFeeCents).toBe(14100);
    expect(conciliada.paidInstallments).toBe(6);
    expect(conciliada.reconciledAt).toEqual(new Date('2026-09-10T12:00:00.000Z'));
  });

  it('cartão aprovado ainda não é dinheiro: fica em "aguardando crédito"', async () => {
    const x = await conciliavel();
    // uma parcela paga hoje no cartão: aprovada, com crédito previsto para daqui a 30 dias
    x.gateway.settlements.set(x.charge.externalId, {
      paidCents: 39874,
      creditedCents: 0,
      awaitingCreditCents: 38874,
      paidInstallments: 1,
      creditedInstallments: 0,
      totalInstallments: 6,
      anticipationFeeCents: 0,
      nextCreditDate: parseLocalDate('2026-09-29'),
      installmentExternalId: null,
    });

    const conciliada = await reconcileCharge(deps(x), equipe, { chargeId: x.charge.id });

    expect(conciliada.settledNetCents).toBe(0);
    expect(conciliada.awaitingCreditCents).toBe(38874);
    expect(conciliada.creditedInstallments).toBe(0);
    expect(conciliada.paidInstallments).toBe(1);
    expect(conciliada.nextCreditDate).toEqual(parseLocalDate('2026-09-29'));
  });

  /**
   * No cartão a antecipação é sempre feita (decisão do dono do produto), então o valor
   * a caminho já aparece com ela descontada: é o que vai entrar na conta.
   */
  it('o que está a caminho já vem com a antecipação descontada', async () => {
    const x = await conciliavel();
    x.gateway.settlements.set(x.charge.externalId, {
      paidCents: 39874,
      creditedCents: 0,
      // 388,74 de líquido da transação menos 6,64 da antecipação
      awaitingCreditCents: 38210,
      paidInstallments: 1,
      creditedInstallments: 0,
      totalInstallments: 6,
      anticipationFeeCents: 664,
      nextCreditDate: parseLocalDate('2026-09-29'),
      installmentExternalId: null,
    });

    const conciliada = await reconcileCharge(deps(x), equipe, { chargeId: x.charge.id });

    expect(conciliada.awaitingCreditCents).toBe(38210);
    // entre o que o cliente pagou e o que entra estão as duas taxas
    expect(conciliada.settledGrossCents! - conciliada.awaitingCreditCents!).toBe(1664);
  });

  it('cobrança antiga sem o id do parcelamento se conserta na conciliação', async () => {
    const x = await conciliavel();
    expect(x.charge.installmentExternalId).toBeNull();
    x.gateway.settlements.set(x.charge.externalId, {
      paidCents: 0,
      creditedCents: 0,
      awaitingCreditCents: 0,
      paidInstallments: 0,
      creditedInstallments: 0,
      totalInstallments: 6,
      anticipationFeeCents: 0,
      nextCreditDate: null,
      installmentExternalId: 'inst_descoberto',
    });

    const conciliada = await reconcileCharge(deps(x), equipe, { chargeId: x.charge.id });
    expect(conciliada.installmentExternalId).toBe('inst_descoberto');
  });

  it('provedor sem resposta não apaga o que já foi conciliado antes', async () => {
    const x = await conciliavel();
    x.gateway.settlements.set(x.charge.externalId, {
      paidCents: 100000,
      creditedCents: 95000,
      awaitingCreditCents: 0,
      paidInstallments: 3,
      creditedInstallments: 3,
      totalInstallments: 6,
      anticipationFeeCents: 0,
      nextCreditDate: null,
      installmentExternalId: null,
    });
    await reconcileCharge(deps(x), equipe, { chargeId: x.charge.id });

    x.gateway.settlements.clear();
    const depoisDaFalha = await reconcileCharge(deps(x), equipe, { chargeId: x.charge.id });
    expect(depoisDaFalha.settledNetCents).toBe(95000);
  });

  it('é da equipe, e cobrança inexistente é 404', async () => {
    const x = await conciliavel();
    const cliente: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: x.s.head.id, userId: 'user-1' },
    };
    await expect(
      reconcileCharge(deps(x), cliente, { chargeId: x.charge.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      reconcileCharge(deps(x), equipe, { chargeId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
