import { describe, expect, it } from 'vitest';
import { cents, parseLocalDate, type PriceCategory } from '@expedition/domain';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeIntakeRepository } from '../intake/intakeRepository.fake.js';
import { getDashboard } from './getDashboard.js';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
const NOW = new Date('2026-03-01T12:00:00.000Z');

function deps() {
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
  const payments = fakePaymentRepository(bookings.rows);
  const intake = fakeIntakeRepository();
  return { schedule, bookings, payments, intake, clock: () => NOW };
}

async function seedGroup(
  schedule: ReturnType<typeof fakeScheduleRepository>,
  name: string,
  start: string,
  end: string,
) {
  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: 'itin-1',
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
    checkedInAt: null,
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

describe('Dashboard — visão geral operacional', () => {
  it('agrega confirmado × projetado, a receber, pendências e próximas saídas', async () => {
    const d = deps();
    const past = await seedGroup(d.schedule, 'Janeiro (passado)', '2026-01-10', '2026-01-14');
    const future = await seedGroup(d.schedule, 'Junho (futuro)', '2026-06-05', '2026-06-09');

    pushBooking(d.bookings, past.id, 'p-c', 'confirmed', 200000);
    await d.payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: 'p-c',
        paidAt: parseLocalDate('2026-01-05'),
        amountCents: cents(150000),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: null,
      },
      null,
    );
    pushBooking(d.bookings, future.id, 'f-c', 'confirmed', 300000);
    pushBooking(d.bookings, future.id, 'f-p', 'pending', 100000);

    await d.intake.store({
      tenantId: ctx.tenantId,
      source: 'wp_flat_v1',
      externalId: 'x:1',
      payload: {},
      normalized: null as never,
      formId: 'f',
      submittedAt: null,
      status: 'needs_allocation',
      error: null,
      itineraryId: null,
      isTest: false,
    });

    const dash = await getDashboard(d, ctx);

    expect(dash.confirmedRevenueCents).toBe(500000); // 200000 + 300000
    expect(dash.projectedRevenueCents).toBe(600000); // + 100000 pendente
    expect(dash.receivedCents).toBe(150000);
    expect(dash.dueCents).toBe(350000); // confirmado 500000 - recebido 150000
    expect(dash.pendingIntakeCount).toBe(1);
    expect(dash.pendingBookingCount).toBe(1); // f-p
    expect(dash.upcoming.map((u) => u.groupId)).toEqual([future.id]); // só a futura
    expect(dash.upcoming[0]).toMatchObject({ confirmedCount: 1, pendingCount: 1 });
  });

  it('cliente não vê o dashboard (403)', async () => {
    const d = deps();
    const customer: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', userId: 'auth-1', customerId: 'c1' },
    };
    await expect(getDashboard(d, customer)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
