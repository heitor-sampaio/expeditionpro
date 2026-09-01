import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { listOpenExpeditions } from '../schedule/listOpenExpeditions.js';
import { listPortalFamily } from './listPortalFamily.js';
import { ForbiddenError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';

const TENANT = 'tenant-a';

async function seedSchedule() {
  const schedule = fakeScheduleRepository();
  const itineraries = fakeItineraryRepository();
  const bookings = fakeBookingRepository();
  const itin = await itineraries.create(
    {
      tenantId: TENANT,
      name: 'Coxilha Rica',
      slug: 'coxilha-rica',
      description: null,
      difficulty: null,
      status: 'active',
      kind: 'catalog',
      childYoungMaxAge: 5,
      childMidMaxAge: 10,
    },
    {
      validFrom: parseLocalDate('2025-01-01'),
      prices: {
        coupleCents: cents(200000),
        soloCents: cents(120000),
        extraAdultCents: cents(80000),
        childMidCents: cents(60000),
        childYoungCents: cents(40000),
      },
    },
  );
  const event = (start: string, status: string, visibility: string) =>
    schedule.createEventWithGroup(
      {
        tenantId: TENANT,
        itineraryId: itin.id,
        startDate: parseLocalDate(start),
        endDate: parseLocalDate(start),
        title: null,
        notes: null,
        status: 'scheduled',
      },
      { name: `g-${start}`, status, capacityVehicles: 4, visibility, pricingMode: 'itinerary' },
    );
  return { schedule, itineraries, bookings, event };
}

const ctx: RequestContext = {
  tenantId: TENANT,
  actor: { kind: 'customer', customerId: 'c1', userId: 'auth-1' },
};

describe('§5.8: expedições abertas do portal', () => {
  it('lista só grupo aberto+público, com roteiro, datas e vagas, ordenado por data', async () => {
    const { schedule, itineraries, bookings, event } = await seedSchedule();
    await event('2025-12-10', 'open', 'public'); // conta
    await event('2025-11-10', 'open', 'public'); // conta, vem antes (data)
    await event('2025-11-20', 'draft', 'public'); // não (rascunho)
    await event('2025-11-25', 'open', 'private'); // não (privado)

    const rows = await listOpenExpeditions({ schedule, bookings, itineraries }, ctx);

    expect(rows.map((r) => r.startDate.day)).toEqual([10, 10]); // 11-10, 12-10
    expect(rows[0]!.itineraryName).toBe('Coxilha Rica');
    expect(rows[0]!.vacancies).toBe(4);
    expect(rows).toHaveLength(2);
  });
});

describe('§3.7: família do cliente para o portal', () => {
  async function seedFamily() {
    const customers = fakeCustomerRepository();
    const head = await customers.create({
      tenantId: TENANT,
      responsibleId: null,
      fullName: 'Heitor Sampaio',
      cpf: parseCpf('90000010057'),
      birthDate: parseLocalDate('1989-01-14'),
      email: null,
      phone: null,
      address: EMPTY_ADDRESS,
    });
    await customers.create({
      tenantId: TENANT,
      responsibleId: head.id,
      fullName: 'Fulana',
      cpf: parseCpf('11144477735'),
      birthDate: parseLocalDate('2015-05-20'),
      email: null,
      phone: null,
      address: EMPTY_ADDRESS,
    });
    return { customers, head };
  }

  it('devolve o responsável e os acompanhantes', async () => {
    const { customers, head } = await seedFamily();
    const family = await listPortalFamily(
      { customers },
      { tenantId: TENANT, actor: { kind: 'customer', customerId: head.id, userId: 'a' } },
    );
    expect(family).toHaveLength(2);
    expect(family[0]!.role).toBe('responsible');
    expect(family.some((m) => m.role === 'companion')).toBe(true);
  });

  it('a equipe não usa esse endpoint (é do cliente)', async () => {
    const { customers } = await seedFamily();
    await expect(
      listPortalFamily(
        { customers },
        { tenantId: TENANT, actor: { kind: 'team', userId: 'u1', role: 'admin' } },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
