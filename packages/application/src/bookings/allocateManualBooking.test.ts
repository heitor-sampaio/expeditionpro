import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { allocateManualBooking, type AllocateManualBookingDeps } from './allocateManualBooking.js';
import { BusinessRuleError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const CPFS = ['90000010057', '11144477735', '52998224725'];

async function setup(pricingMode: 'manual' | 'itinerary' = 'manual') {
  const customers = fakeCustomerRepository();
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();

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
      name: 'Grupo fechado',
      status: 'open',
      capacityVehicles: null,
      visibility: 'private',
      pricingMode,
    },
  );

  const deps: AllocateManualBookingDeps = { customers, schedule, bookings };
  return { deps, customers, bookings, group };
}

async function makeCustomer(
  customers: ReturnType<typeof fakeCustomerRepository>,
  cpf: string,
  responsibleId: string | null,
) {
  return customers.create({
    tenantId: ctx.tenantId,
    responsibleId,
    fullName: `Pessoa ${cpf}`,
    cpf: parseCpf(cpf),
    birthDate: parseLocalDate('1989-01-14'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
}

describe('AG-08: alocação em grupo de preço manual (pacote negociado)', () => {
  it('cria booking pending com o valor livre congelado, sem aplicar categorias', async () => {
    const { deps, customers, group } = await setup('manual');
    const resp = await makeCustomer(customers, CPFS[0]!, null);
    const comp = await makeCustomer(customers, CPFS[1]!, resp.id);

    const result = await allocateManualBooking(deps, ctx, {
      groupId: group.id,
      responsibleCustomerId: resp.id,
      participantCustomerIds: [resp.id, comp.id],
      totalCents: cents(350000),
      note: 'pacote fechado dez/25',
    });

    expect(result.totalCents).toBe(350000);
    expect(result.booking.status).toBe('pending');
    expect(result.booking.source).toBe('manual');
    // o total é a soma dos unitários; a categoria não é resolvida por idade (é MANUAL)
    const total = result.booking.participants.reduce((s, p) => s + p.unitPriceCents, 0);
    expect(total).toBe(350000);
    expect(result.booking.participants.every((p) => p.priceCategory === 'MANUAL')).toBe(true);
    expect(result.booking.participants.every((p) => p.priceSource === 'manual')).toBe(true);
  });

  it('recusa se o grupo não é de preço manual (usa o caminho automático)', async () => {
    const { deps, customers, group } = await setup('itinerary');
    const resp = await makeCustomer(customers, CPFS[0]!, null);
    await expect(
      allocateManualBooking(deps, ctx, {
        groupId: group.id,
        responsibleCustomerId: resp.id,
        participantCustomerIds: [resp.id],
        totalCents: cents(100000),
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'not_manual_pricing' });
  });

  it('recusa valor negativo', async () => {
    const { deps, customers, group } = await setup('manual');
    const resp = await makeCustomer(customers, CPFS[0]!, null);
    await expect(
      allocateManualBooking(deps, ctx, {
        groupId: group.id,
        responsibleCustomerId: resp.id,
        participantCustomerIds: [resp.id],
        totalCents: -1 as never,
        note: null,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('recusa segundo booking do mesmo responsável no grupo', async () => {
    const { deps, customers, group } = await setup('manual');
    const resp = await makeCustomer(customers, CPFS[0]!, null);
    const cmd = {
      groupId: group.id,
      responsibleCustomerId: resp.id,
      participantCustomerIds: [resp.id],
      totalCents: cents(100000),
      note: null,
    };
    await allocateManualBooking(deps, ctx, cmd);
    await expect(allocateManualBooking(deps, ctx, cmd)).rejects.toMatchObject({
      code: 'already_allocated',
    });
  });
});
