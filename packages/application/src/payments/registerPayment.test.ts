import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakePaymentRepository } from './paymentRepository.fake.js';
import { fakePaymentIntegrationRepository } from './paymentIntegrationRepository.fake.js';
import { fakePaymentGateway } from './paymentGateway.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { registerPayment } from './registerPayment.js';
import { connectPaymentProvider } from './connectPaymentProvider.js';
import type { RequestContext } from '../context.js';

/**
 * PG-09 — o recebimento lançado à mão também passa pelo provedor: um pix de R$ 100 deixa
 * R$ 99,01 na conta quando a taxa fixa é R$ 0,99.
 *
 * O ledger registra **o que entrou** (IN-08/PG-08); o que o cliente pagou fica ao lado.
 * Dinheiro em espécie não passa por gateway nenhum e entra integral.
 */

const AGORA = new Date('2026-08-29T12:00:00.000Z');
const owner: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

async function seed({ conectado = true } = {}) {
  const bookings = fakeBookingRepository();
  const payments = fakePaymentRepository(bookings.rows);
  const customers = fakeCustomerRepository();
  const integrations = fakePaymentIntegrationRepository();
  const gateway = fakePaymentGateway();
  const audit = fakeAuditLogRepository();

  const head = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Vanessa Santos',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1990-03-04'),
    email: 'v@example.com',
    phone: '5548999990000',
    address: EMPTY_ADDRESS,
  });

  const booking = await bookings.create({
    tenantId: 'tenant-a',
    groupId: 'grupo-1',
    responsibleCustomerId: head.id,
    status: 'pending',
    source: 'manual',
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

  if (conectado) {
    await connectPaymentProvider({ integrations, gateway, audit, clock: () => AGORA }, owner, {
      environment: 'production',
      accessToken: 'aact_valida',
    });
  }

  return { bookings, payments, integrations, gateway, booking };
}

const deps = (s: Awaited<ReturnType<typeof seed>>) => ({
  payments: s.payments,
  bookings: s.bookings,
  integrations: s.integrations,
  gateway: s.gateway,
  clock: () => AGORA,
});

describe('PG-09: o lançamento manual desconta a taxa do provedor', () => {
  it('pix de R$ 100 entra como R$ 99,01 — a taxa fixa é do provedor', async () => {
    const s = await seed();

    const { payment } = await registerPayment(deps(s), owner, {
      bookingId: s.booking.id,
      amountCents: 10000,
      method: 'pix',
      paidAt: '2026-08-29',
    });

    expect(Number(payment.amountCents)).toBe(9901);
    expect(payment.customerPaidCents).toBe(10000);
  });

  it('dinheiro em espécie não passa por gateway: entra integral', async () => {
    const s = await seed();

    const { payment } = await registerPayment(deps(s), owner, {
      bookingId: s.booking.id,
      amountCents: 10000,
      method: 'cash',
      paidAt: '2026-08-29',
    });

    expect(Number(payment.amountCents)).toBe(10000);
    expect(payment.customerPaidCents).toBe(10000);
  });

  it('sem gateway conectado, o lançamento continua funcionando — e entra integral', async () => {
    const s = await seed({ conectado: false });

    const { payment } = await registerPayment(deps(s), owner, {
      bookingId: s.booking.id,
      amountCents: 10000,
      method: 'pix',
      paidAt: '2026-08-29',
    });

    expect(Number(payment.amountCents)).toBe(10000);
  });

  it('cartão à vista desconta percentual e fixa', async () => {
    const s = await seed();

    const { payment } = await registerPayment(deps(s), owner, {
      bookingId: s.booking.id,
      amountCents: 10000,
      method: 'card',
      paidAt: '2026-08-29',
    });

    // 1,99% + R$ 0,49 no plano da conta
    expect(Number(payment.amountCents)).toBe(9752);
  });

  it('o primeiro recebimento confirma a inscrição, como sempre (IN-08)', async () => {
    const s = await seed();
    const { confirmedNow } = await registerPayment(deps(s), owner, {
      bookingId: s.booking.id,
      amountCents: 10000,
      method: 'pix',
      paidAt: '2026-08-29',
    });
    expect(confirmedNow).toBe(true);
    expect(s.bookings.rows[0]!.status).toBe('confirmed');
  });
});
