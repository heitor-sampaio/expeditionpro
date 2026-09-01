import { describe, expect, it } from 'vitest';
import { cents } from '@expedition/domain';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakePaymentRepository } from './paymentRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeCashbackRepository } from '../cashback/cashbackRepository.fake.js';
import { registerPayment } from './registerPayment.js';
import { registerRefund } from './registerRefund.js';
import { deletePayment } from './deletePayment.js';
import type { RequestContext } from '../context.js';

/**
 * A09 · IN-09/IN-11 — o dinheiro do cliente deixa rastro.
 *
 * A auditoria de segurança achou a assimetria: cupom, desconto, check-in, exclusão de gasto
 * e de pagamento a fornecedor **gravam** trilha; entrada, estorno e exclusão de recebimento
 * do cliente, **não**. `deletePayment` é a operação com maior potencial de fraude interna do
 * sistema — apaga dinheiro recebido, exige owner/admin, e até agora não deixava vestígio de
 * quem apagou nem de quanto era.
 *
 * O que a trilha precisa carregar é o valor: registro que some sem dizer quanto era não
 * permite reconstruir o saldo depois, que é justamente o motivo de existir.
 */

const owner: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

const clock = () => new Date('2026-09-01T12:00:00Z');

async function comInscricao() {
  const bookings = fakeBookingRepository();
  const booking = await bookings.create({
    tenantId: 'tenant-a',
    groupId: 'grp-1',
    responsibleCustomerId: 'c1',
    status: 'pending',
    source: 'manual',
    participants: [
      {
        customerId: 'c1',
        priceCategory: 'SOLO',
        unitPriceCents: cents(120000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  });
  return {
    bookings,
    booking,
    payments: fakePaymentRepository(),
    cashback: fakeCashbackRepository(),
    audit: fakeAuditLogRepository(),
  };
}

describe('A09: entrada, estorno e exclusão de recebimento deixam trilha', () => {
  it('IN-09: registrar recebimento grava quem, quanto e em qual inscrição', async () => {
    const s = await comInscricao();

    const pago = await registerPayment(
      { payments: s.payments, bookings: s.bookings, audit: s.audit, clock },
      owner,
      { bookingId: s.booking.id, amountCents: 60000, method: 'pix', paidAt: '2026-09-01' },
    );

    const trilha = s.audit.rows.find((r) => r.action === 'booking_payment.register');
    expect(trilha).toMatchObject({ entity: 'booking_payment', actorUserId: 'u1' });
    expect(trilha?.diff).toMatchObject({
      bookingId: s.booking.id,
      amountCents: 60000,
      method: 'pix',
    });
    expect(pago).toBeDefined();
  });

  it('IN-11: excluir recebimento grava quanto era — sem isso o saldo não se reconstrói', async () => {
    const s = await comInscricao();
    const pago = await registerPayment(
      { payments: s.payments, bookings: s.bookings, audit: s.audit, clock },
      owner,
      { bookingId: s.booking.id, amountCents: 60000, method: 'pix', paidAt: '2026-09-01' },
    );

    await deletePayment({ payments: s.payments, bookings: s.bookings, audit: s.audit }, owner, {
      paymentId: pago.payment.id,
    });

    const trilha = s.audit.rows.find((r) => r.action === 'booking_payment.delete');
    expect(trilha).toMatchObject({ entity: 'booking_payment', actorUserId: 'u1' });
    expect(trilha?.diff).toMatchObject({ bookingId: s.booking.id, amountCents: 60000 });
  });

  it('IN-12: estorno grava o valor devolvido', async () => {
    const s = await comInscricao();
    await registerPayment(
      { payments: s.payments, bookings: s.bookings, audit: s.audit, clock },
      owner,
      { bookingId: s.booking.id, amountCents: 60000, method: 'pix', paidAt: '2026-09-01' },
    );

    await registerRefund(
      {
        payments: s.payments,
        bookings: s.bookings,
        cashback: s.cashback,
        audit: s.audit,
        clock,
      },
      owner,
      {
        bookingId: s.booking.id,
        amountCents: 20000,
        destination: 'cash',
        method: 'pix',
        paidAt: '2026-09-02',
        reason: 'desistência parcial',
      },
    );

    const trilha = s.audit.rows.find((r) => r.action === 'booking_payment.refund');
    expect(trilha?.diff).toMatchObject({ bookingId: s.booking.id, amountCents: 20000 });
  });
});
