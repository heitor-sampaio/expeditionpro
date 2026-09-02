import { describe, expect, it } from 'vitest';
import { cents, parseLocalDate } from '@expedition/domain';
import { fakeAuditLogRepository } from './audit/auditLogRepository.fake.js';
import { fakeBookingRepository } from './bookings/bookingRepository.fake.js';
import { fakeCouponRepository } from './coupons/couponRepository.fake.js';
import { fakeScheduleRepository } from './schedule/scheduleRepository.fake.js';
import { fakeSupplierRepository } from './suppliers/supplierRepository.fake.js';
import { fakePaymentRepository } from './payments/paymentRepository.fake.js';
import { fakeIntakeRepository } from './intake/intakeRepository.fake.js';
import { cancelBooking } from './bookings/cancelBooking.js';
import { confirmBookingManually } from './bookings/confirmBookingManually.js';
import { deleteScheduleEvent } from './schedule/deleteScheduleEvent.js';
import { addSupplierExpense } from './suppliers/addSupplierExpense.js';
import { registerSupplierPayment } from './suppliers/registerSupplierPayment.js';
import type { RequestContext } from './context.js';

/**
 * A09 — o que destrói ou cria obrigação financeira deixa rastro.
 *
 * Duas assimetrias que a auditoria apontou:
 *
 * 1. **`cancelBooking` estava pela metade**: importava `actorUserId` e nunca chamava
 *    `audit.record`. Trilha começada e não terminada é pior que ausente, porque o import
 *    faz parecer que existe.
 * 2. **Excluir gasto e pagamento a fornecedor gravava; criar, não.** Só com o lado da
 *    exclusão não dá para reconstruir o saldo: some o "menos" e o "mais" nunca existiu.
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
  return { bookings, booking, coupons: fakeCouponRepository(), audit: fakeAuditLogRepository() };
}

describe('A09: cancelamento e confirmação manual deixam trilha', () => {
  it('IN-13: cancelar grava o motivo — é o que se pergunta depois', async () => {
    const s = await comInscricao();

    await cancelBooking(
      { bookings: s.bookings, coupons: s.coupons, audit: s.audit, clock },
      owner,
      { bookingId: s.booking.id, reason: 'cliente desistiu' },
    );

    const trilha = s.audit.rows.find((r) => r.action === 'booking.cancel');
    expect(trilha).toMatchObject({ entity: 'booking', entityId: s.booking.id, actorUserId: 'u1' });
    expect(trilha?.diff).toMatchObject({ reason: 'cliente desistiu' });
  });

  it('IN-10: confirmar sem pagamento é exceção — e exceção sem registro vira regra', async () => {
    const s = await comInscricao();

    await confirmBookingManually({ bookings: s.bookings, audit: s.audit, clock }, owner, {
      bookingId: s.booking.id,
      note: 'pagou em espécie na saída anterior',
    });

    const trilha = s.audit.rows.find((r) => r.action === 'booking.confirm_manual');
    expect(trilha?.diff).toMatchObject({ note: 'pagou em espécie na saída anterior' });
  });
});

describe('A09: criar obrigação financeira grava, como apagar já gravava', () => {
  async function comFornecedor() {
    const suppliers = fakeSupplierRepository();
    const schedule = fakeScheduleRepository();
    const audit = fakeAuditLogRepository();
    const fornecedor = await suppliers.createSupplier({
      tenantId: 'tenant-a',
      name: 'Fazenda',
      doc: null,
      docType: null,
      pixKey: null,
      pixKeyType: null,
      phone: null,
      email: null,
      notes: null,
      categoryId: null,
    });
    const evento = await schedule.createEventWithGroup(
      {
        tenantId: 'tenant-a',
        itineraryId: 'itin-1',
        startDate: parseLocalDate('2026-10-10'),
        endDate: parseLocalDate('2026-10-12'),
        title: null,
        notes: null,
        status: 'scheduled',
      },
      {
        name: 'Saída',
        status: 'open',
        capacityVehicles: 4,
        visibility: 'public',
        pricingMode: 'itinerary',
      },
    );
    return { suppliers, schedule, audit, fornecedor, groupId: evento.group.id };
  }

  it('GR-08: lançar gasto grava fornecedor, descrição e valor', async () => {
    const s = await comFornecedor();

    const gasto = await addSupplierExpense(
      { suppliers: s.suppliers, schedule: s.schedule, audit: s.audit },
      owner,
      {
        groupId: s.groupId,
        supplierId: s.fornecedor.id,
        description: 'Pernoite',
        totalCents: 120000,
      },
    );

    const trilha = s.audit.rows.find((r) => r.action === 'supplier_expense.add');
    expect(trilha).toMatchObject({ entity: 'supplier_expense', entityId: gasto.id });
    expect(trilha?.diff).toMatchObject({ totalCents: 120000, supplierId: s.fornecedor.id });
  });

  it('GR-09: pagar fornecedor grava valor e forma', async () => {
    const s = await comFornecedor();
    const gasto = await addSupplierExpense(
      { suppliers: s.suppliers, schedule: s.schedule, audit: s.audit },
      owner,
      {
        groupId: s.groupId,
        supplierId: s.fornecedor.id,
        description: 'Pernoite',
        totalCents: 120000,
      },
    );

    await registerSupplierPayment({ suppliers: s.suppliers, audit: s.audit }, owner, {
      expenseId: gasto.id,
      amountCents: 60000,
      method: 'pix',
      paidAt: '2026-09-01',
    });

    const trilha = s.audit.rows.find((r) => r.action === 'supplier_payment.register');
    expect(trilha?.diff).toMatchObject({ amountCents: 60000, method: 'pix' });
  });
});

describe('A09: apagar saída da agenda deixa trilha', () => {
  it('AG-05: excluir evento grava o que sumiu do calendário', async () => {
    const schedule = fakeScheduleRepository();
    const audit = fakeAuditLogRepository();
    const evento = await schedule.createEventWithGroup(
      {
        tenantId: 'tenant-a',
        itineraryId: 'itin-1',
        startDate: parseLocalDate('2026-11-01'),
        endDate: parseLocalDate('2026-11-03'),
        title: null,
        notes: null,
        status: 'scheduled',
      },
      {
        name: 'Saída a apagar',
        status: 'open',
        capacityVehicles: 4,
        visibility: 'public',
        pricingMode: 'itinerary',
      },
    );

    await deleteScheduleEvent(
      {
        schedule,
        bookings: fakeBookingRepository(),
        suppliers: fakeSupplierRepository(),
        payments: fakePaymentRepository(),
        intake: fakeIntakeRepository(),
        audit,
      },
      owner,
      { eventId: evento.event.id },
    );

    const trilha = audit.rows.find((r) => r.action === 'schedule_event.delete');
    expect(trilha).toMatchObject({ entity: 'schedule_event', entityId: evento.event.id });
  });
});
