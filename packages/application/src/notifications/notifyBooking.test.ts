import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate, type PriceCategory } from '@expedition/domain';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeNotificationGateway } from './notificationGateway.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { notifyBooking } from './notifyBooking.js';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord } from '../bookings/bookingRepository.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

async function seed(over: { email?: string | null } = {}) {
  const bookings = fakeBookingRepository();
  const customers = fakeCustomerRepository();
  const schedule = fakeScheduleRepository();
  const notifications = fakeNotificationGateway();

  const resp = await customers.create({
    tenantId: ctx.tenantId,
    responsibleId: null,
    fullName: 'Ana Prado',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1985-01-01'),
    email: over.email === undefined ? 'ana@ex.com' : over.email,
    phone: null,
    address: EMPTY_ADDRESS,
  });
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
      name: 'Coxilha Rica',
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );
  const booking: BookingRecord = {
    id: 'bk-1',
    groupId: group.id,
    responsibleCustomerId: resp.id,
    status: 'pending',
    source: 'manual',
    invoiceChecked: false,
    checkedInAt: null,
    participants: [
      {
        id: 'p1',
        customerId: resp.id,
        priceCategory: 'SOLO' as PriceCategory,
        unitPriceCents: cents(120000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  };
  bookings.rows.push(booking);
  return { bookings, customers, schedule, notifications };
}

describe('PC-23: notificação de inscrição', () => {
  it('"recebida": envia ao responsável com roteiro e datas', async () => {
    const deps = await seed();
    const result = await notifyBooking(deps, ctx, { bookingId: 'bk-1', kind: 'received' });
    expect(result.sent).toBe(true);
    expect(deps.notifications.sent).toHaveLength(1);
    expect(deps.notifications.sent[0]).toMatchObject({
      kind: 'received',
      to: 'ana@ex.com',
      customerName: 'Ana Prado',
      groupName: 'Coxilha Rica',
      startDate: '2025-11-10',
      endDate: '2025-11-14',
    });
  });

  it('"confirmada": envia o segundo tipo', async () => {
    const deps = await seed();
    await notifyBooking(deps, ctx, { bookingId: 'bk-1', kind: 'confirmed' });
    expect(deps.notifications.sent[0]!.kind).toBe('confirmed');
  });

  it('cliente sem e-mail não recebe (sent false, gateway não chamado)', async () => {
    const deps = await seed({ email: null });
    const result = await notifyBooking(deps, ctx, { bookingId: 'bk-1', kind: 'received' });
    expect(result.sent).toBe(false);
    expect(deps.notifications.sent).toHaveLength(0);
  });

  it('inscrição inexistente é recusada', async () => {
    const deps = await seed();
    await expect(
      notifyBooking(deps, ctx, { bookingId: 'nao-existe', kind: 'received' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
