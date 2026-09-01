import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { cents, type PriceCategory } from '@expedition/domain';
import { fakePaymentRepository } from './paymentRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeCashbackRepository } from '../cashback/cashbackRepository.fake.js';
import { registerRefund } from './registerRefund.js';
import { registerPayment } from './registerPayment.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord } from '../bookings/bookingRepository.js';

/**
 * §3.6 — devolução do que já entrou. Saída cancelada normalmente devolve tudo; até a
 * devolução ser lançada, o dinheiro segue como receita recebida. Devolver **em dinheiro**
 * tira do caixa; converter **em cashback** não é receita nem despesa — vira crédito do
 * cliente. Nos dois casos o lançamento é uma contrapartida no ledger (negativa), nunca
 * um apagão do recebimento original.
 */

const admin: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const operator: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u2', role: 'operator' },
};
const clock = () => new Date('2026-08-27T12:00:00Z');

async function seed(receivedCents = 200000) {
  const payments = fakePaymentRepository();
  const bookings = fakeBookingRepository();
  const cashback = fakeCashbackRepository();

  const booking: BookingRecord = {
    id: 'bk-1',
    groupId: 'grp-1',
    responsibleCustomerId: 'cust-1',
    status: 'pending',
    source: 'manual',
    invoiceChecked: false,
    participants: [
      {
        id: 'bk-1-p0',
        customerId: 'cust-1',
        priceCategory: 'COUPLE' as PriceCategory,
        unitPriceCents: cents(200000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  };
  bookings.rows.push(booking);

  // o recebimento entra pelo caminho normal (e confirma a inscrição, IN-08)
  await registerPayment({ payments, bookings, audit: fakeAuditLogRepository(), clock }, admin, {
    bookingId: 'bk-1',
    amountCents: receivedCents,
    method: 'pix',
    paidAt: '2026-08-01',
  });

  return { payments, bookings, cashback };
}

async function netReceived(payments: ReturnType<typeof fakePaymentRepository>, bookingId = 'bk-1') {
  const rows = await payments.listByBooking('tenant-a', bookingId);
  return rows.reduce((total, row) => total + row.amountCents, 0);
}

describe('§3.6: devolução em dinheiro', () => {
  it('lança a contrapartida negativa e o recebido líquido cai', async () => {
    const { payments, bookings, cashback } = await seed();

    const result = await registerRefund(
      { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
      admin,
      {
        bookingId: 'bk-1',
        amountCents: 50000,
        destination: 'cash',
        method: 'pix',
        paidAt: '2026-08-27',
        reason: 'Saída cancelada',
      },
    );

    expect(result.netReceivedCents).toBe(150000);
    expect(await netReceived(payments)).toBe(150000);
    const rows = await payments.listByBooking('tenant-a', 'bk-1');
    expect(rows.some((r) => r.amountCents === -50000 && r.kind === 'refund')).toBe(true);
    // o recebimento original continua no ledger, intacto
    expect(rows.some((r) => r.amountCents === 200000 && r.kind === 'payment')).toBe(true);
  });

  it('devolução integral cancela a inscrição no mesmo ato', async () => {
    const { payments, bookings, cashback } = await seed();

    const result = await registerRefund(
      { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
      admin,
      {
        bookingId: 'bk-1',
        amountCents: 200000,
        destination: 'cash',
        method: 'pix',
        paidAt: '2026-08-27',
        reason: 'Saída cancelada',
      },
    );

    expect(result.netReceivedCents).toBe(0);
    expect(result.bookingCancelled).toBe(true);
    const booking = await bookings.findById('tenant-a', 'bk-1');
    expect(booking!.status).toBe('cancelled');
  });

  it('devolução parcial não cancela a inscrição', async () => {
    const { payments, bookings, cashback } = await seed();
    const result = await registerRefund(
      { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
      admin,
      {
        bookingId: 'bk-1',
        amountCents: 1,
        destination: 'cash',
        method: 'pix',
        paidAt: '2026-08-27',
        reason: 'Ajuste',
      },
    );
    expect(result.bookingCancelled).toBe(false);
    // segue ativa (a confirmação cruzada é do repositório real; aqui basta não cancelar)
    expect((await bookings.findById('tenant-a', 'bk-1'))!.status).not.toBe('cancelled');
  });
});

describe('§3.6: conversão em cashback', () => {
  it('sai do recebido e vira crédito do responsável — sem virar despesa', async () => {
    const { payments, bookings, cashback } = await seed();

    await registerRefund(
      { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
      admin,
      {
        bookingId: 'bk-1',
        amountCents: 200000,
        destination: 'cashback',
        paidAt: '2026-08-27',
        reason: 'Cliente preferiu crédito',
      },
    );

    expect(await netReceived(payments)).toBe(0);
    const rows = await payments.listByBooking('tenant-a', 'bk-1');
    expect(rows.some((r) => r.amountCents === -200000 && r.kind === 'cashback')).toBe(true);

    // o crédito aparece no extrato do cliente, disponível e sem prazo
    const entries = await cashback.listByCustomer('tenant-a', 'cust-1');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amountCents).toBe(200000);
    expect(entries[0]!.type).toBe('adjustment');
    expect(entries[0]!.expiresAt).toBeNull();
    expect(await cashback.balance('tenant-a', 'cust-1')).toBe(200000);
  });

  it('conversão integral também cancela a inscrição', async () => {
    const { payments, bookings, cashback } = await seed();
    const result = await registerRefund(
      { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
      admin,
      {
        bookingId: 'bk-1',
        amountCents: 200000,
        destination: 'cashback',
        paidAt: '2026-08-27',
        reason: 'Crédito',
      },
    );
    expect(result.bookingCancelled).toBe(true);
  });
});

describe('§3.6: guardas da devolução', () => {
  it('não devolve mais do que entrou', async () => {
    const { payments, bookings, cashback } = await seed();
    await expect(
      registerRefund(
        { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
        admin,
        {
          bookingId: 'bk-1',
          amountCents: 200001,
          destination: 'cash',
          method: 'pix',
          paidAt: '2026-08-27',
          reason: 'Demais',
        },
      ),
    ).rejects.toMatchObject({ code: 'refund_exceeds_received' });
  });

  it('valor precisa ser inteiro positivo e o motivo é obrigatório', async () => {
    const { payments, bookings, cashback } = await seed();
    const base = {
      bookingId: 'bk-1',
      destination: 'cash' as const,
      method: 'pix',
      paidAt: '2026-08-27',
      reason: 'Ok',
    };
    await expect(
      registerRefund(
        { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
        admin,
        { ...base, amountCents: 0 },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      registerRefund(
        { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
        admin,
        {
          ...base,
          amountCents: 1000,
          reason: '   ',
        },
      ),
    ).rejects.toMatchObject({ code: 'required_field' });
  });

  it('exige owner/admin e inscrição existente', async () => {
    const { payments, bookings, cashback } = await seed();
    await expect(
      registerRefund(
        { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
        operator,
        {
          bookingId: 'bk-1',
          amountCents: 1000,
          destination: 'cash',
          method: 'pix',
          paidAt: '2026-08-27',
          reason: 'Ok',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      registerRefund(
        { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
        admin,
        {
          bookingId: 'nao-existe',
          amountCents: 1000,
          destination: 'cash',
          method: 'pix',
          paidAt: '2026-08-27',
          reason: 'Ok',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('inscrição sem nada recebido não tem o que devolver', async () => {
    const { payments, bookings, cashback } = await seed();
    bookings.rows.push({
      id: 'bk-2',
      groupId: 'grp-1',
      responsibleCustomerId: 'cust-2',
      status: 'pending',
      source: 'manual',
      invoiceChecked: false,
      participants: [],
    });

    await expect(
      registerRefund(
        { payments, bookings, cashback, audit: fakeAuditLogRepository(), clock },
        admin,
        {
          bookingId: 'bk-2',
          amountCents: 1000,
          destination: 'cash',
          method: 'pix',
          paidAt: '2026-08-27',
          reason: 'Ok',
        },
      ),
    ).rejects.toMatchObject({ code: 'refund_exceeds_received' });
  });
});
