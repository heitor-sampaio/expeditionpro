import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakePaymentRepository } from './paymentRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakePaymentIntegrationRepository } from './paymentIntegrationRepository.fake.js';
import { fakePaymentChargeRepository } from './paymentChargeRepository.fake.js';
import { fakePaymentGateway } from './paymentGateway.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { connectPaymentProvider } from './connectPaymentProvider.js';
import { listPaymentIntegrations } from './listPaymentIntegrations.js';
import { disconnectPaymentProvider } from './disconnectPaymentProvider.js';
import { createBookingCharge } from './createBookingCharge.js';
import { updatePaymentFees } from './updatePaymentFees.js';
import { settleChargeFromWebhook } from './settleChargeFromWebhook.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

/**
 * PG-01/PG-02/PG-03 — integração com o ASAAS: conectar a conta, emitir cobrança de uma
 * inscrição e receber o webhook que lança o recebimento no ledger.
 *
 * O que **não** muda: o lançamento manual continua existindo, e a confirmação continua
 * vindo do dinheiro (§3.5). O gateway só automatiza quem digita.
 */

const AGORA = new Date('2026-08-28T15:00:00.000Z');

const owner: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
const operador: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u2', role: 'operator' },
};
const sistema: RequestContext = { tenantId: 'tenant-a', actor: { kind: 'system' } };

async function seed() {
  const integrations = fakePaymentIntegrationRepository();
  const charges = fakePaymentChargeRepository();
  const gateway = fakePaymentGateway();
  const bookings = fakeBookingRepository();
  const payments = fakePaymentRepository(bookings.rows);
  const customers = fakeCustomerRepository();
  const audit = fakeAuditLogRepository();

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

  const booking = await bookings.create({
    tenantId: 'tenant-a',
    groupId: 'grupo-1',
    responsibleCustomerId: head.id,
    status: 'pending',
    source: 'portal',
    participants: [
      {
        customerId: head.id,
        priceCategory: 'SOLO',
        unitPriceCents: cents(120000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  });

  return { integrations, charges, gateway, bookings, payments, customers, audit, head, booking };
}

const connectDeps = (s: Awaited<ReturnType<typeof seed>>) => ({
  integrations: s.integrations,
  gateway: s.gateway,
  audit: s.audit,
  clock: () => AGORA,
});

const chargeDeps = (s: Awaited<ReturnType<typeof seed>>) => ({
  integrations: s.integrations,
  charges: s.charges,
  gateway: s.gateway,
  bookings: s.bookings,
  payments: s.payments,
  customers: s.customers,
  audit: s.audit,
  clock: () => AGORA,
});

const webhookDeps = (s: Awaited<ReturnType<typeof seed>>) => ({
  integrations: s.integrations,
  charges: s.charges,
  bookings: s.bookings,
  payments: s.payments,
  audit: s.audit,
  clock: () => AGORA,
});

async function conectado(s: Awaited<ReturnType<typeof seed>>) {
  return connectPaymentProvider(connectDeps(s), owner, {
    environment: 'sandbox',
    accessToken: 'aact_valida',
  });
}

describe('PG-01: conectar a conta do ASAAS', () => {
  it('valida a chave no provedor e guarda a conexão com o nome da conta', async () => {
    const s = await seed();
    const result = await conectado(s);

    expect(result.accountName).toBe('Drakkar Expedições');
    expect(result.environment).toBe('sandbox');
    // O token nunca volta inteiro: a tela mostra só o fim, para conferência.
    expect(result.tokenPreview).toBe('•••• lida');
    expect(s.integrations.rows[0]!.accessToken).toBe('aact_valida');
  });

  it('chave inválida não conecta — e nada é guardado', async () => {
    const s = await seed();
    await expect(
      connectPaymentProvider(connectDeps(s), owner, {
        environment: 'sandbox',
        accessToken: 'errada',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(s.integrations.rows).toHaveLength(0);
  });

  it('sandbox e produção convivem; reconectar o mesmo ambiente troca a chave', async () => {
    const s = await seed();
    await conectado(s);
    await connectPaymentProvider(connectDeps(s), owner, {
      environment: 'production',
      accessToken: 'aact_producao',
    });
    await connectPaymentProvider(connectDeps(s), owner, {
      environment: 'sandbox',
      accessToken: 'aact_nova',
    });

    expect(s.integrations.rows).toHaveLength(2);
    const sandbox = s.integrations.rows.find((r) => r.environment === 'sandbox');
    expect(sandbox!.accessToken).toBe('aact_nova');
  });

  it('o segredo do webhook volta na conexão — é a única vez que ele aparece', async () => {
    const s = await seed();
    const connected = await conectado(s);

    // SEC-01: o banco guarda só o hash. O valor em claro existe uma vez, aqui.
    expect(connected.webhookToken).toBeTruthy();
    expect(JSON.stringify(s.integrations.rows[0])).not.toContain(connected.webhookToken!);

    const list = await listPaymentIntegrations({ integrations: s.integrations }, owner);
    expect(JSON.stringify(list)).not.toContain(connected.webhookToken!);
  });

  it('cada conexão nasce com um segredo próprio de webhook', async () => {
    const s = await seed();
    await conectado(s);
    await connectPaymentProvider(connectDeps(s), owner, {
      environment: 'production',
      accessToken: 'aact_producao',
    });
    const [a, b] = s.integrations.rows;
    expect(a!.webhookTokenHash).toBeTruthy();
    expect(a!.webhookTokenHash).not.toBe(b!.webhookTokenHash);
  });

  it('conectar e desconectar exigem owner ou admin — dinheiro do tenant', async () => {
    const s = await seed();
    await expect(
      connectPaymentProvider(connectDeps(s), operador, {
        environment: 'sandbox',
        accessToken: 'aact_valida',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await conectado(s);
    await expect(
      disconnectPaymentProvider({ integrations: s.integrations, audit: s.audit }, operador, {
        environment: 'sandbox',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a listagem nunca devolve o token, e o cliente não lê a integração', async () => {
    const s = await seed();
    await conectado(s);
    const list = await listPaymentIntegrations({ integrations: s.integrations }, owner);
    expect(list[0]).toMatchObject({ environment: 'sandbox', tokenPreview: '•••• lida' });
    expect(JSON.stringify(list)).not.toContain('aact_valida');

    const cliente: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: s.head.id, userId: 'user-1' },
    };
    await expect(
      listPaymentIntegrations({ integrations: s.integrations }, cliente),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('desconectar remove a credencial guardada', async () => {
    const s = await seed();
    await conectado(s);
    await disconnectPaymentProvider({ integrations: s.integrations, audit: s.audit }, owner, {
      environment: 'sandbox',
    });
    expect(s.integrations.rows).toHaveLength(0);
  });
});

describe('PG-02: emitir cobrança de uma inscrição', () => {
  it('cria a cobrança no provedor e guarda o link para mandar ao cliente', async () => {
    const s = await seed();
    await conectado(s);

    const charge = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'PIX',
      dueDate: '2026-09-05',
    });

    expect(charge.externalId).toBe('pay_1');
    expect(charge.invoiceUrl).toBe('https://sandbox.asaas.com/i/pay_1');
    // Sem valor informado, cobra o que falta pagar: contratado − recebido, mais a taxa
    // que o provedor informou (pix: R$ 0,99).
    expect(charge.netAmountCents).toBe(120000);
    expect(charge.amountCents).toBe(120099);
    expect(s.gateway.charges[0]!.customer.cpf).toBe('15350946056');
  });

  /**
   * CP-05 · PG-02 — o desconto do cupom é o motivo de o cliente pagar menos; se a
   * cobrança sair pelo valor cheio, o cupom não valeu nada e o cliente recebe um boleto
   * que não bate com o combinado. O saldo aqui é o **contratado** (subtotal − desconto),
   * o mesmo número que a mesa e o cashback leem.
   */
  it('CP-05: inscrição com cupom cobra o contratado, não a soma dos unitários', async () => {
    const s = await seed();
    await conectado(s);
    s.bookings.rows[0] = {
      ...s.bookings.rows[0]!,
      discount: { couponId: 'cup-1', code: 'DRK10', discountCents: cents(12000) },
    };

    const charge = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'PIX',
      dueDate: '2026-09-05',
    });

    expect(charge.netAmountCents).toBe(108000);
  });

  it('CP-05/CP-07: cupom que zera o que falta não vira cobrança de zero', async () => {
    const s = await seed();
    await conectado(s);
    s.bookings.rows[0] = {
      ...s.bookings.rows[0]!,
      discount: { couponId: 'cup-1', code: 'CORTESIA', discountCents: cents(120000) },
    };

    await expect(
      createBookingCharge(chargeDeps(s), owner, {
        bookingId: s.booking.id,
        environment: 'sandbox',
        billingType: 'PIX',
        dueDate: '2026-09-05',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('valor informado manda no lugar do saldo — entrada, parcela, acerto', async () => {
    const s = await seed();
    await conectado(s);
    const charge = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'BOLETO',
      dueDate: '2026-09-05',
      amountCents: 50000,
    });
    expect(charge.netAmountCents).toBe(50000);
    expect(charge.amountCents).toBe(50099);
  });

  it('não cobra inscrição quitada nem cancelada', async () => {
    const s = await seed();
    await conectado(s);
    await s.payments.create(
      {
        tenantId: 'tenant-a',
        bookingId: s.booking.id,
        paidAt: parseLocalDate('2026-08-01'),
        amountCents: cents(120000),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: 'u1',
      },
      null,
    );
    await expect(
      createBookingCharge(chargeDeps(s), owner, {
        bookingId: s.booking.id,
        environment: 'sandbox',
        billingType: 'PIX',
        dueDate: '2026-09-05',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('sem conta conectada naquele ambiente, não há o que cobrar', async () => {
    const s = await seed();
    await expect(
      createBookingCharge(chargeDeps(s), owner, {
        bookingId: s.booking.id,
        environment: 'sandbox',
        billingType: 'PIX',
        dueDate: '2026-09-05',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('inscrição inexistente é 404', async () => {
    const s = await seed();
    await conectado(s);
    await expect(
      createBookingCharge(chargeDeps(s), owner, {
        bookingId: 'nao-existe',
        environment: 'sandbox',
        billingType: 'PIX',
        dueDate: '2026-09-05',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('PG-03: o webhook do ASAAS lança o recebimento', () => {
  async function comCobranca() {
    const s = await seed();
    const conexao = await conectado(s);
    const charge = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'PIX',
      dueDate: '2026-09-05',
    });
    return { s, charge, token: conexao.webhookToken! };
  }

  const evento = (paymentId: string, value: number) => ({
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: paymentId,
      value,
      billingType: 'PIX',
      status: 'RECEIVED',
      dueDate: '2026-09-05',
      paymentDate: '2026-09-02',
    },
  });

  it('pago no ASAAS, o recebimento entra no ledger e a inscrição confirma', async () => {
    const { s, charge, token } = await comCobranca();

    const result = await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      // o cliente paga o bruto; o que quita a inscrição é o líquido (PG-08)
      body: evento(charge.externalId, Number(charge.amountCents) / 100),
    });

    expect(result.handled).toBe(true);
    const lancamentos = await s.payments.listByBooking('tenant-a', s.booking.id);
    expect(lancamentos).toHaveLength(1);
    expect(Number(lancamentos[0]!.amountCents)).toBe(120000);
    expect(lancamentos[0]!.method).toBe('pix');
    expect(s.bookings.rows[0]!.status).toBe('confirmed');
  });

  it('reenvio do mesmo evento não lança o recebimento duas vezes', async () => {
    const { s, charge, token } = await comCobranca();
    const body = evento(charge.externalId, 1200);

    await settleChargeFromWebhook(webhookDeps(s), sistema, { token, body });
    const segundo = await settleChargeFromWebhook(webhookDeps(s), sistema, { token, body });

    expect(segundo.handled).toBe(false);
    expect(await s.payments.listByBooking('tenant-a', s.booking.id)).toHaveLength(1);
  });

  it('token errado é recusado — é ele que autentica o provedor', async () => {
    const { s, charge } = await comCobranca();
    await expect(
      settleChargeFromWebhook(webhookDeps(s), sistema, {
        token: 'outro-token',
        body: evento(charge.externalId, 1200),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('evento de cobrança que não é nossa passa em branco, sem erro', async () => {
    const { s, token } = await comCobranca();
    const result = await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: evento('pay_de_outro_sistema', 500),
    });
    expect(result.handled).toBe(false);
  });

  it('evento que não é recebimento só muda o estado da cobrança', async () => {
    const { s, charge, token } = await comCobranca();
    await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: { event: 'PAYMENT_OVERDUE', payment: { id: charge.externalId } },
    });

    expect(s.charges.rows[0]!.status).toBe('overdue');
    expect(await s.payments.listByBooking('tenant-a', s.booking.id)).toHaveLength(0);
  });

  it('corpo que não entendemos não derruba o webhook', async () => {
    const { s, token } = await comCobranca();
    const result = await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: { event: 'PAYMENT_ANTICIPATED' },
    });
    expect(result.handled).toBe(false);
  });

  it('pagamento parcial quita na mesma proporção — o resto continua em aberto', async () => {
    const { s, charge, token } = await comCobranca();
    const metadeDoBruto = Number(charge.amountCents) / 2;

    await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: evento(charge.externalId, metadeDoBruto / 100),
    });

    const lancamentos = await s.payments.listByBooking('tenant-a', s.booking.id);
    expect(Number(lancamentos[0]!.amountCents)).toBe(60000);
  });
});

describe('PG-04/PG-05: a cobrança sai pelo bruto, para sobrar o líquido', () => {
  // Só a antecipação é configurada: a taxa da transação vem do provedor (PG-05), que
  // sabe a faixa de parcelas do plano contratado.
  const TAXAS = { card: { anticipationMonthlyBps: 170 }, pix: {}, boleto: {} };

  async function comTaxas() {
    const s = await seed();
    const conexao = await conectado(s);
    await updatePaymentFees({ integrations: s.integrations, audit: s.audit }, owner, {
      environment: 'sandbox',
      feeSettings: TAXAS,
    });
    // O segredo em claro só existe no retorno da conexão (SEC-01) — quem for simular a
    // chamada do provedor precisa guardá-lo aqui, como quem cola o token no ASAAS faria.
    return { ...s, segredoWebhook: conexao.webhookToken! };
  }

  it('a taxa da transação é a que o provedor informou, não uma tabela nossa', async () => {
    const s = await comTaxas();
    const charge = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'PIX',
      dueDate: '2026-09-05',
      amountCents: 389000,
    });

    // pix no plano: R$ 0,99 fixo, sem percentual
    expect(charge.netAmountCents).toBe(389000);
    expect(charge.amountCents).toBe(389099);
    expect(s.gateway.charges[0]!.amountCents).toBe(389099);
  });

  it('cartão à vista e parcelado usam faixas diferentes, como o provedor cobra', async () => {
    const s = await comTaxas();
    const aVista = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'CREDIT_CARD',
      dueDate: '2026-09-05',
      amountCents: 100000,
    });
    const em6 = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'CREDIT_CARD',
      dueDate: '2026-09-05',
      amountCents: 100000,
      installments: 6,
    });

    // 1x: 1,99% + 1,70% × 1 mês | 6x: 2,49% + 1,70% × 3,5 meses
    expect(em6.amountCents).toBeGreaterThan(aVista.amountCents);
    expect(em6.installments).toBe(6);
    expect(em6.netAmountCents).toBe(100000);
  });

  it('sem antecipação configurada, o custo é só o que o provedor cobra', async () => {
    const s = await seed();
    await conectado(s);
    const charge = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'CREDIT_CARD',
      dueDate: '2026-09-05',
      amountCents: 100000,
    });
    // 1,99% + R$ 0,49, sem antecipação
    expect(charge.amountCents).toBe(102081);
  });

  it('sem valor informado, o líquido é o que falta pagar da inscrição', async () => {
    const s = await comTaxas();
    const charge = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'PIX',
      dueDate: '2026-09-05',
    });
    expect(charge.netAmountCents).toBe(120000);
    expect(charge.amountCents).toBe(120099);
  });

  it('o webhook lança o que quita a inscrição, não o que o cliente pagou', async () => {
    const s = await comTaxas();
    const charge = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'PIX',
      dueDate: '2026-09-05',
      amountCents: 389000,
    });
    await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token: s.segredoWebhook,
      body: {
        event: 'PAYMENT_RECEIVED',
        payment: {
          id: charge.externalId,
          value: Number(charge.amountCents) / 100,
          billingType: 'PIX',
          status: 'RECEIVED',
          dueDate: '2026-09-05',
          paymentDate: '2026-09-02',
        },
      },
    });
    const lancamentos = await s.payments.listByBooking('tenant-a', s.booking.id);
    expect(Number(lancamentos[0]!.amountCents)).toBe(389000);
    expect(lancamentos[0]!.customerPaidCents).toBe(389099);
  });

  it('salvar taxas exige owner ou admin', async () => {
    const s = await seed();
    await conectado(s);
    await expect(
      updatePaymentFees({ integrations: s.integrations, audit: s.audit }, operador, {
        environment: 'sandbox',
        feeSettings: TAXAS,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('antecipação absurda não fecha conta: erro de regra, não número impossível', async () => {
    const s = await seed();
    await conectado(s);
    await updatePaymentFees({ integrations: s.integrations, audit: s.audit }, owner, {
      environment: 'sandbox',
      feeSettings: { card: { anticipationMonthlyBps: 2000 } },
    });
    await expect(
      createBookingCharge(chargeDeps(s), owner, {
        bookingId: s.booking.id,
        environment: 'sandbox',
        billingType: 'CREDIT_CARD',
        dueDate: '2026-09-05',
        amountCents: 100000,
        installments: 12,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('PG-03: cobrança parcelada — o provedor manda um evento por parcela', () => {
  async function comParcelamento() {
    const s = await seed();
    const conexao = await conectado(s);
    const charge = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType: 'CREDIT_CARD',
      dueDate: '2026-09-05',
      amountCents: 120000,
      installments: 6,
    });
    return { s, charge, token: conexao.webhookToken! };
  }

  const parcela = (paymentId: string, installmentId: string, value: number) => ({
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: paymentId,
      installment: installmentId,
      value,
      billingType: 'CREDIT_CARD',
      status: 'RECEIVED',
      dueDate: '2026-09-05',
      paymentDate: '2026-09-02',
    },
  });

  it('a parcela encontra a cobrança pelo id do parcelamento e a quita de uma vez', async () => {
    const { s, charge, token } = await comParcelamento();
    const inst = charge.installmentExternalId!;
    expect(inst).toBeTruthy();

    const parcelaBruta = Number(charge.amountCents) / 6 / 100;
    await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: parcela('pay_p1', inst, parcelaBruta),
    });
    await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: parcela('pay_p2', inst, parcelaBruta),
    });

    // cartão: a venda foi aprovada inteira, então um lançamento pelo valor da inscrição
    const lancamentos = await s.payments.listByBooking('tenant-a', s.booking.id);
    expect(lancamentos).toHaveLength(1);
    expect(Number(lancamentos[0]!.amountCents)).toBe(120000);
  });

  it('reenvio da mesma parcela não duplica — a marca é o id da parcela', async () => {
    const { s, charge, token } = await comParcelamento();
    const body = parcela('pay_p1', charge.installmentExternalId!, 200);

    await settleChargeFromWebhook(webhookDeps(s), sistema, { token, body });
    const segundo = await settleChargeFromWebhook(webhookDeps(s), sistema, { token, body });

    expect(segundo.handled).toBe(false);
    expect(await s.payments.listByBooking('tenant-a', s.booking.id)).toHaveLength(1);
  });

  it('a primeira parcela paga confirma a inscrição; as seguintes não mexem no status', async () => {
    const { s, charge, token } = await comParcelamento();
    const inst = charge.installmentExternalId!;

    await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: parcela('pay_p1', inst, 200),
    });
    expect(s.bookings.rows[0]!.status).toBe('confirmed');

    await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: parcela('pay_p2', inst, 200),
    });
    expect(s.bookings.rows[0]!.status).toBe('confirmed');
  });
});

/**
 * PG-08 — a taxa é **repassada ao cliente**: ele paga o bruto e o provedor credita o
 * líquido. O ledger da inscrição registra o que **quita** — o líquido —, senão a
 * inscrição fica paga a mais no valor exato da taxa e o "a receber" do grupo vira
 * negativo.
 */
/**
 * PG-08 — o ledger registra **o valor da inscrição**, uma vez por cobrança.
 *
 * O número de parcelas serve para calcular quanto cobrar do cliente, não para fatiar o
 * recebimento: no cartão, a venda é aprovada inteira e o que muda é só quando o dinheiro
 * cai. O que interessa à inscrição é ter entrado na conta o valor combinado.
 *
 * Boleto e pix parcelados são outra coisa — ali cada parcela é uma cobrança que o cliente
 * paga sozinha, e pode nunca pagar a seguinte. Essas quitam proporcionalmente.
 */
describe('PG-08: um lançamento por cobrança, pelo valor da inscrição', () => {
  async function comCobranca(billingType: 'CREDIT_CARD' | 'BOLETO', installments = 1) {
    const s = await seed();
    const conexao = await conectado(s);
    const charge = await createBookingCharge(chargeDeps(s), owner, {
      bookingId: s.booking.id,
      environment: 'sandbox',
      billingType,
      dueDate: '2026-09-05',
      amountCents: 120000,
      ...(installments > 1 ? { installments } : {}),
    });
    return { s, charge, token: conexao.webhookToken! };
  }

  const pagamento = (
    paymentId: string,
    installmentId: string | null,
    valueCents: number,
    billingType: string,
  ) => ({
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: paymentId,
      ...(installmentId ? { installment: installmentId } : {}),
      value: valueCents / 100,
      billingType,
      status: 'RECEIVED',
      dueDate: '2026-09-05',
      paymentDate: '2026-09-02',
    },
  });

  it('cartão em 6x: um lançamento com o valor da inscrição, não seis', async () => {
    const { s, charge, token } = await comCobranca('CREDIT_CARD', 6);
    const parcelaBruta = Number(charge.amountCents) / 6;

    for (let i = 1; i <= 6; i += 1) {
      await settleChargeFromWebhook(webhookDeps(s), sistema, {
        token,
        body: pagamento(`pay_p${i}`, charge.installmentExternalId, parcelaBruta, 'CREDIT_CARD'),
      });
    }

    const lancamentos = await s.payments.listByBooking('tenant-a', s.booking.id);
    expect(lancamentos).toHaveLength(1);
    expect(Number(lancamentos[0]!.amountCents)).toBe(120000);
    expect(lancamentos[0]!.customerPaidCents).toBe(Number(charge.amountCents));
    expect(lancamentos[0]!.chargeId).toBe(charge.id);
  });

  it('cartão à vista: mesma coisa, um lançamento pelo valor da inscrição', async () => {
    const { s, charge, token } = await comCobranca('CREDIT_CARD');
    await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: pagamento(charge.externalId, null, Number(charge.amountCents), 'CREDIT_CARD'),
    });

    const lancamentos = await s.payments.listByBooking('tenant-a', s.booking.id);
    expect(lancamentos).toHaveLength(1);
    expect(Number(lancamentos[0]!.amountCents)).toBe(120000);
  });

  it('boleto parcelado: cada parcela quita a sua parte, porque pode não vir a próxima', async () => {
    const { s, charge, token } = await comCobranca('BOLETO', 3);
    const parcelaBruta = Number(charge.amountCents) / 3;

    await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: pagamento('pay_b1', charge.installmentExternalId, parcelaBruta, 'BOLETO'),
    });

    const lancamentos = await s.payments.listByBooking('tenant-a', s.booking.id);
    expect(lancamentos).toHaveLength(1);
    // um terço do líquido, não o total
    expect(Number(lancamentos[0]!.amountCents)).toBe(40000);
  });

  it('a inscrição confirma no primeiro recebimento, como sempre', async () => {
    const { s, charge, token } = await comCobranca('CREDIT_CARD', 6);
    await settleChargeFromWebhook(webhookDeps(s), sistema, {
      token,
      body: pagamento('pay_p1', charge.installmentExternalId, 39874, 'CREDIT_CARD'),
    });
    expect(s.bookings.rows[0]!.status).toBe('confirmed');
  });
});
