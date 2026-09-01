import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { cents, parseLocalDate } from '@expedition/domain';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { fakeCouponRepository } from '../coupons/couponRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { confirmBookingManually } from './confirmBookingManually.js';
import { cancelBooking } from './cancelBooking.js';
import { deletePayment } from '../payments/deletePayment.js';
import { ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord } from './bookingRepository.js';

const FIXED = new Date('2026-08-24T12:00:00.000Z');

function ctxWith(
  actor:
    | { kind: 'team'; userId: string; role: 'owner' | 'admin' | 'operator' | 'viewer' }
    | { kind: 'customer'; customerId: string; userId: string },
): RequestContext {
  return { tenantId: 'tenant-a', actor };
}
const admin = ctxWith({ kind: 'team', userId: 'u1', role: 'admin' });

function seed(status = 'pending') {
  const bookings = fakeBookingRepository();
  const booking: BookingRecord = {
    id: 'bk-1',
    groupId: 'g-1',
    responsibleCustomerId: 'resp',
    status,
    source: 'manual',
    invoiceChecked: false,
    participants: [],
  };
  bookings.rows.push(booking);
  return bookings;
}

describe('IN-10: confirmação manual sem pagamento, com motivo obrigatório', () => {
  it('confirma uma inscrição pending com motivo', async () => {
    const bookings = seed('pending');
    const result = await confirmBookingManually(
      { bookings, audit: fakeAuditLogRepository(), clock: () => FIXED },
      admin,
      {
        bookingId: 'bk-1',
        note: 'cortesia acertada por fora',
      },
    );
    expect(result.status).toBe('confirmed');
    expect(bookings.rows[0]!.status).toBe('confirmed');
  });

  it('motivo em branco é recusado', async () => {
    const bookings = seed('pending');
    await expect(
      confirmBookingManually(
        { bookings, audit: fakeAuditLogRepository(), clock: () => FIXED },
        admin,
        {
          bookingId: 'bk-1',
          note: '  ',
        },
      ),
    ).rejects.toBeInstanceOf(RequiredFieldError);
  });

  it('IN-09: operator não pode confirmar (403)', async () => {
    const bookings = seed('pending');
    await expect(
      confirmBookingManually(
        { bookings, audit: fakeAuditLogRepository(), clock: () => FIXED },
        ctxWith({ kind: 'team', userId: 'u2', role: 'operator' }),
        { bookingId: 'bk-1', note: 'x' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('inscrição já confirmada não reconfirma', async () => {
    const bookings = seed('confirmed');
    await expect(
      confirmBookingManually(
        { bookings, audit: fakeAuditLogRepository(), clock: () => FIXED },
        admin,
        {
          bookingId: 'bk-1',
          note: 'x',
        },
      ),
    ).rejects.toMatchObject({ code: 'not_pending' });
  });
});

describe('IN-15/IN-16: cancelamento com motivo, sem apagar recebimento', () => {
  it('cancela uma inscrição com motivo', async () => {
    const bookings = seed('confirmed');
    const result = await cancelBooking(
      {
        bookings,
        coupons: fakeCouponRepository(),
        audit: fakeAuditLogRepository(),
        clock: () => FIXED,
      },
      admin,
      {
        bookingId: 'bk-1',
        reason: 'cliente desistiu',
      },
    );
    expect(result.status).toBe('cancelled');
  });

  it('motivo obrigatório', async () => {
    const bookings = seed('confirmed');
    await expect(
      cancelBooking(
        {
          bookings,
          coupons: fakeCouponRepository(),
          audit: fakeAuditLogRepository(),
          clock: () => FIXED,
        },
        admin,
        {
          bookingId: 'bk-1',
          reason: '',
        },
      ),
    ).rejects.toBeInstanceOf(RequiredFieldError);
  });

  it('IN-15: cliente não cancela (403)', async () => {
    const bookings = seed('confirmed');
    await expect(
      cancelBooking(
        {
          bookings,
          coupons: fakeCouponRepository(),
          audit: fakeAuditLogRepository(),
          clock: () => FIXED,
        },
        ctxWith({ kind: 'customer', customerId: 'c1', userId: 'u3' }),
        { bookingId: 'bk-1', reason: 'quero cancelar' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('inscrição já cancelada não recancela', async () => {
    const bookings = seed('cancelled');
    await expect(
      cancelBooking(
        {
          bookings,
          coupons: fakeCouponRepository(),
          audit: fakeAuditLogRepository(),
          clock: () => FIXED,
        },
        admin,
        {
          bookingId: 'bk-1',
          reason: 'x',
        },
      ),
    ).rejects.toMatchObject({ code: 'already_cancelled' });
  });

  it('IN-16: cancelar NÃO apaga o recebimento — o valor fica no ledger', async () => {
    const bookings = seed('confirmed');
    const payments = fakePaymentRepository(bookings.rows);
    await payments.create(
      {
        tenantId: 'tenant-a',
        bookingId: 'bk-1',
        paidAt: parseLocalDate('2026-01-10'),
        amountCents: cents(50000),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: null,
      },
      null,
    );
    await cancelBooking(
      {
        bookings,
        coupons: fakeCouponRepository(),
        audit: fakeAuditLogRepository(),
        clock: () => FIXED,
      },
      admin,
      {
        bookingId: 'bk-1',
        reason: 'desistiu',
      },
    );
    expect(await payments.listByBooking('tenant-a', 'bk-1')).toHaveLength(1);
  });
});

describe('IN-11: excluir o único pagamento não reverte o status', () => {
  async function seedConfirmedWithPayment() {
    const bookings = seed('pending');
    const payments = fakePaymentRepository(bookings.rows);
    const payment = await payments.create(
      {
        tenantId: 'tenant-a',
        bookingId: 'bk-1',
        paidAt: parseLocalDate('2026-01-10'),
        amountCents: cents(50000),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: null,
      },
      { confirmedBy: 'u1', confirmedAt: FIXED },
    );
    return { bookings, payments, payment };
  }

  it('exclui o único pagamento: status permanece confirmed e sinaliza requiresDecision', async () => {
    const { bookings, payments, payment } = await seedConfirmedWithPayment();
    const result = await deletePayment(
      { payments, bookings, audit: fakeAuditLogRepository() },
      admin,
      { paymentId: payment.id },
    );

    expect(result.remainingPayments).toBe(0);
    expect(result.bookingStatus).toBe('confirmed'); // NÃO reverteu
    expect(result.requiresDecision).toBe(true);
    expect(bookings.rows[0]!.status).toBe('confirmed');
  });

  it('com outro pagamento restante, não exige decisão', async () => {
    const { bookings, payments, payment } = await seedConfirmedWithPayment();
    await payments.create(
      {
        tenantId: 'tenant-a',
        bookingId: 'bk-1',
        paidAt: parseLocalDate('2026-01-11'),
        amountCents: cents(30000),
        method: 'cash',
        reference: null,
        notes: null,
        createdBy: null,
      },
      null,
    );
    const result = await deletePayment(
      { payments, bookings, audit: fakeAuditLogRepository() },
      admin,
      { paymentId: payment.id },
    );
    expect(result.remainingPayments).toBe(1);
    expect(result.requiresDecision).toBe(false);
  });

  it('IN-09: operator não exclui recebimento (403)', async () => {
    const { bookings, payments, payment } = await seedConfirmedWithPayment();
    await expect(
      deletePayment(
        { payments, bookings },
        ctxWith({ kind: 'team', userId: 'u2', role: 'operator' }),
        { paymentId: payment.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('recebimento inexistente é recusado', async () => {
    const { bookings, payments } = await seedConfirmedWithPayment();
    await expect(
      deletePayment({ payments, bookings, audit: fakeAuditLogRepository() }, admin, {
        paymentId: 'nao-existe',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
