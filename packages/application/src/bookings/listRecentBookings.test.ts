import { describe, expect, it } from 'vitest';
import { cents, parseLocalDate, type PriceCategory } from '@expedition/domain';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { listRecentBookings } from './listRecentBookings.js';
import { ForbiddenError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { parseCpf } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { BookingRecord } from './bookingRepository.js';

/**
 * IN-17b — as últimas inscrições que entraram, de qualquer origem (portal, site, manual).
 * É a lista que a equipe olha depois de processar a fila: quem entrou, em qual saída e
 * como está. Leitura de equipe; o cliente tem a própria ficha.
 */
const team: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

async function seed() {
  const bookings = fakeBookingRepository();
  const schedule = fakeScheduleRepository();
  const customers = fakeCustomerRepository();

  const cliente = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Vanessa Santos',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1990-03-04'),
    email: 'v@ex.com',
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
      name: 'Coxilha Rica · 10/11/2026',
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );

  const push = (id: string, source: string, status: string) => {
    const record: BookingRecord = {
      id,
      groupId: group.id,
      responsibleCustomerId: cliente.id,
      status,
      source,
      invoiceChecked: false,
      checkedInAt: null,
      participants: [
        {
          id: `${id}-p0`,
          customerId: cliente.id,
          priceCategory: 'SOLO' as PriceCategory,
          unitPriceCents: cents(120000),
          priceSource: 'auto',
          priceNote: null,
        },
      ],
    };
    bookings.rows.push(record);
  };

  return { bookings, schedule, customers, push, group, cliente };
}

describe('IN-17b: últimas inscrições recebidas', () => {
  it('lista com responsável, saída, origem e valor contratado', async () => {
    const { bookings, schedule, customers, push, group, cliente } = await seed();
    push('bk-1', 'portal', 'pending');

    const rows = await listRecentBookings({ bookings, schedule, customers }, team, {});

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      bookingId: 'bk-1',
      groupId: group.id,
      groupName: 'Coxilha Rica · 10/11/2026',
      responsibleName: 'Vanessa Santos',
      responsibleCustomerId: cliente.id,
      status: 'pending',
      source: 'portal',
      participantCount: 1,
      contractedCents: 120000,
    });
  });

  it('mais recentes primeiro e respeita o limite', async () => {
    const { bookings, schedule, customers, push } = await seed();
    push('bk-1', 'webhook', 'pending');
    push('bk-2', 'manual', 'confirmed');
    push('bk-3', 'portal', 'pending');

    const rows = await listRecentBookings({ bookings, schedule, customers }, team, { limit: 2 });
    expect(rows.map((r) => r.bookingId)).toEqual(['bk-3', 'bk-2']);
  });

  it('é leitura de equipe — o cliente usa a própria ficha', async () => {
    const { bookings, schedule, customers, cliente } = await seed();
    const customerCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: cliente.id, userId: 'c1' },
    };
    await expect(
      listRecentBookings({ bookings, schedule, customers }, customerCtx, {}),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
