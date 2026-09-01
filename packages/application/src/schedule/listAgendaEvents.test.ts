import { describe, expect, it } from 'vitest';
import { cents, parseLocalDate } from '@expedition/domain';
import { fakeScheduleRepository } from './scheduleRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { listAgendaEvents } from './listAgendaEvents.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

async function group(schedule: ReturnType<typeof fakeScheduleRepository>, capacity: number | null) {
  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: 'itin-1',
      startDate: parseLocalDate('2025-11-10'),
      endDate: parseLocalDate('2025-11-14'),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: 'g',
      status: 'open',
      capacityVehicles: capacity,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );
  return group;
}

async function booking(
  bookings: ReturnType<typeof fakeBookingRepository>,
  groupId: string,
  status: string,
) {
  await bookings.create({
    tenantId: ctx.tenantId,
    groupId,
    responsibleCustomerId: `resp-${Math.random()}`,
    status,
    source: 'manual',
    participants: [
      {
        customerId: 'c',
        priceCategory: 'SOLO',
        unitPriceCents: cents(1000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  });
}

describe('AG-06: ocupação do evento na agenda', () => {
  it('com capacidade: confirmadas, pendentes e vagas (confirmada ocupa, pendente não)', async () => {
    const schedule = fakeScheduleRepository();
    const bookings = fakeBookingRepository();
    const g = await group(schedule, 4);
    await booking(bookings, g.id, 'confirmed');
    await booking(bookings, g.id, 'confirmed');
    await booking(bookings, g.id, 'pending');
    await booking(bookings, g.id, 'cancelled'); // não conta

    const rows = await listAgendaEvents({ schedule, bookings }, ctx);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.occupancy).toEqual({
      capacityVehicles: 4,
      confirmedCount: 2,
      pendingCount: 1,
      vacancies: 2,
    });
  });

  it('sem limite (capacity null): só a contagem, vagas null', async () => {
    const schedule = fakeScheduleRepository();
    const bookings = fakeBookingRepository();
    const g = await group(schedule, null);
    await booking(bookings, g.id, 'confirmed');

    const rows = await listAgendaEvents({ schedule, bookings }, ctx);
    expect(rows[0]!.occupancy).toEqual({
      capacityVehicles: null,
      confirmedCount: 1,
      pendingCount: 0,
      vacancies: null,
    });
  });

  it('evento sem inscrição vem zerado', async () => {
    const schedule = fakeScheduleRepository();
    const bookings = fakeBookingRepository();
    await group(schedule, 4);

    const rows = await listAgendaEvents({ schedule, bookings }, ctx);
    expect(rows[0]!.occupancy.confirmedCount).toBe(0);
    expect(rows[0]!.occupancy.vacancies).toBe(4);
  });
});
