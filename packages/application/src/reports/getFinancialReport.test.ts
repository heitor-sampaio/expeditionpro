import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { cents, parseLocalDate, type PriceCategory } from '@expedition/domain';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeSupplierRepository } from '../suppliers/supplierRepository.fake.js';
import { createSupplier } from '../suppliers/createSupplier.js';
import { addSupplierExpense } from '../suppliers/addSupplierExpense.js';
import { getFinancialReport } from './getFinancialReport.js';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

function deps() {
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
  const payments = fakePaymentRepository(bookings.rows);
  const suppliers = fakeSupplierRepository();
  return { schedule, bookings, payments, suppliers };
}

async function seedGroup(
  schedule: ReturnType<typeof fakeScheduleRepository>,
  name: string,
  start: string,
  end: string,
  itineraryId = 'itin-1',
) {
  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId,
      startDate: parseLocalDate(start),
      endDate: parseLocalDate(end),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name,
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );
  return group;
}

function pushBooking(
  bookings: ReturnType<typeof fakeBookingRepository>,
  groupId: string,
  id: string,
  status: 'confirmed' | 'pending',
  total: number,
) {
  bookings.rows.push({
    id,
    groupId,
    responsibleCustomerId: `${id}-c`,
    status,
    source: 'manual',
    invoiceChecked: false,
    participants: [
      {
        id: `${id}-p`,
        customerId: `${id}-c`,
        priceCategory: 'SOLO' as PriceCategory,
        unitPriceCents: cents(total),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  });
}

describe('Relatório de fechamento por saída (consolidado GR-10)', () => {
  it('uma linha por saída (receita confirmada, gastos, margem, %, a receber) + totais do tenant', async () => {
    const d = deps();
    const g1 = await seedGroup(d.schedule, 'Coxilha Rica', '2025-11-10', '2025-11-14');
    const g2 = await seedGroup(d.schedule, 'Vale Europeu', '2025-12-05', '2025-12-09');

    // g1: receita confirmada 400000 (+ pendente 100000 que NÃO entra), recebido 300000
    pushBooking(d.bookings, g1.id, 'g1-c', 'confirmed', 400000);
    pushBooking(d.bookings, g1.id, 'g1-p', 'pending', 100000);
    await d.payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: 'g1-c',
        paidAt: parseLocalDate('2025-11-01'),
        amountCents: cents(300000),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: null,
      },
      null,
    );
    const sup = await createSupplier(
      { suppliers: d.suppliers, audit: fakeAuditLogRepository() },
      ctx,
      { name: 'Fornecedor' },
    );
    await addSupplierExpense(
      { suppliers: d.suppliers, schedule: d.schedule, audit: fakeAuditLogRepository() },
      ctx,
      {
        groupId: g1.id,
        supplierId: sup.id,
        description: 'van',
        totalCents: 250000,
      },
    );

    // g2: receita confirmada 600000, sem gastos
    pushBooking(d.bookings, g2.id, 'g2-c', 'confirmed', 600000);

    const report = await getFinancialReport(d, ctx);

    expect(report.rows).toHaveLength(2);
    const r1 = report.rows.find((r) => r.groupId === g1.id)!;
    expect(r1).toMatchObject({
      groupName: 'Coxilha Rica',
      revenueCents: 400000, // só confirmada
      expenseCents: 250000,
      grossMarginCents: 150000,
      marginPercent: 37.5,
      receivedCents: 300000,
      dueCents: 100000, // 400000 - 300000
    });
    const r2 = report.rows.find((r) => r.groupId === g2.id)!;
    expect(r2).toMatchObject({ revenueCents: 600000, expenseCents: 0, grossMarginCents: 600000 });

    expect(report.totals).toMatchObject({
      revenueCents: 1000000,
      expenseCents: 250000,
      grossMarginCents: 750000,
      marginPercent: 75,
      receivedCents: 300000,
      dueCents: 700000, // g1: 400000-300000=100000; g2: 600000-0=600000
    });
  });

  it('ordena as saídas por data de início', async () => {
    const d = deps();
    await seedGroup(d.schedule, 'Dezembro', '2025-12-05', '2025-12-09');
    await seedGroup(d.schedule, 'Novembro', '2025-11-10', '2025-11-14');
    const report = await getFinancialReport(d, ctx);
    expect(report.rows.map((r) => r.groupName)).toEqual(['Novembro', 'Dezembro']);
  });

  it('sem saídas: relatório vazio com totais zerados', async () => {
    const d = deps();
    const report = await getFinancialReport(d, ctx);
    expect(report.rows).toHaveLength(0);
    expect(report.totals).toMatchObject({
      revenueCents: 0,
      grossMarginCents: 0,
      marginPercent: null,
    });
  });

  it('filtra por período (só saídas com início na janela)', async () => {
    const d = deps();
    await seedGroup(d.schedule, 'Novembro', '2025-11-10', '2025-11-14');
    await seedGroup(d.schedule, 'Dezembro', '2025-12-05', '2025-12-09');
    await seedGroup(d.schedule, 'Janeiro', '2026-01-08', '2026-01-12');

    const report = await getFinancialReport(d, ctx, {
      from: parseLocalDate('2025-12-01'),
      to: parseLocalDate('2025-12-31'),
    });
    expect(report.rows.map((r) => r.groupName)).toEqual(['Dezembro']);
  });

  it('filtra por roteiro', async () => {
    const d = deps();
    const g1 = await seedGroup(d.schedule, 'Coxilha', '2025-11-10', '2025-11-14', 'itin-A');
    await seedGroup(d.schedule, 'Vale', '2025-12-05', '2025-12-09', 'itin-B');

    const report = await getFinancialReport(d, ctx, { itineraryId: 'itin-A' });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]!.groupId).toBe(g1.id);
  });

  it('cliente não vê o relatório financeiro (403)', async () => {
    const d = deps();
    const customer: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', userId: 'auth-1', customerId: 'c1' },
    };
    await expect(getFinancialReport(d, customer)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
