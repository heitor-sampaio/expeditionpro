import { describe, expect, it } from 'vitest';
import { cents, parseLocalDate } from '@expedition/domain';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeScheduleRepository } from './scheduleRepository.fake.js';
import { createScheduleEvent } from './createScheduleEvent.js';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { NewItinerary, NewPriceVersion } from '../itineraries/itineraryRepository.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

function seedItinerary(name = 'Coxilha Rica') {
  const itineraries = fakeItineraryRepository();
  const schedule = fakeScheduleRepository();
  const itin: NewItinerary = {
    tenantId: ctx.tenantId,
    name,
    slug: 'coxilha-rica',
    description: null,
    difficulty: null,
    status: 'active',
    kind: 'catalog',
    childYoungMaxAge: 5,
    childMidMaxAge: 10,
  };
  const price: NewPriceVersion = {
    validFrom: parseLocalDate('2025-01-01'),
    prices: {
      coupleCents: cents(200000),
      soloCents: cents(120000),
      extraAdultCents: cents(80000),
      childMidCents: cents(60000),
      childYoungCents: cents(40000),
    },
  };
  return { itineraries, schedule, itin, price };
}

describe('AG-03: criação do evento gera o grupo correspondente', () => {
  it('cria evento e grupo atomicamente, vinculados, com o mesmo roteiro e datas', async () => {
    const { itineraries, schedule, itin, price } = seedItinerary();
    const created = await itineraries.create(itin, price);

    const result = await createScheduleEvent({ schedule, itineraries }, ctx, {
      itineraryId: created.id,
      startDate: '2025-11-10',
      endDate: '2025-11-14',
    });

    expect(result.event.itineraryId).toBe(created.id);
    expect(result.event.startDate).toEqual(parseLocalDate('2025-11-10'));
    expect(result.group.scheduleEventId).toBe(result.event.id);
    expect(result.group.itineraryId).toBe(created.id);
    expect(schedule.events).toHaveLength(1);
  });

  it('AG-01/§5.8: grupo nasce aberto, público e itinerary por padrão', async () => {
    const { itineraries, schedule, itin, price } = seedItinerary();
    const created = await itineraries.create(itin, price);

    const result = await createScheduleEvent({ schedule, itineraries }, ctx, {
      itineraryId: created.id,
      startDate: '2025-11-10',
      endDate: '2025-11-14',
    });

    expect(result.group.pricingMode).toBe('itinerary');
    expect(result.group.visibility).toBe('public');
    expect(result.group.status).toBe('open');
    expect(result.group.capacityVehicles).toBeNull();
  });

  it('AG-08: aceita grupo manual e privado com capacidade definida', async () => {
    const { itineraries, schedule, itin, price } = seedItinerary();
    const created = await itineraries.create(itin, price);

    const result = await createScheduleEvent({ schedule, itineraries }, ctx, {
      itineraryId: created.id,
      startDate: '2025-11-10',
      endDate: '2025-11-14',
      pricingMode: 'manual',
      visibility: 'private',
      capacityVehicles: 8,
    });

    expect(result.group.pricingMode).toBe('manual');
    expect(result.group.visibility).toBe('private');
    expect(result.group.capacityVehicles).toBe(8);
  });

  it('AG-02: recusa data de término anterior ao início', async () => {
    const { itineraries, schedule, itin, price } = seedItinerary();
    const created = await itineraries.create(itin, price);

    await expect(
      createScheduleEvent({ schedule, itineraries }, ctx, {
        itineraryId: created.id,
        startDate: '2025-11-14',
        endDate: '2025-11-10',
      }),
    ).rejects.toMatchObject({ code: 'invalid_date_range' });
    expect(schedule.events).toHaveLength(0);
  });

  it('recusa evento para roteiro inexistente no tenant', async () => {
    const { itineraries, schedule } = seedItinerary();
    await expect(
      createScheduleEvent({ schedule, itineraries }, ctx, {
        itineraryId: 'nao-existe',
        startDate: '2025-11-10',
        endDate: '2025-11-14',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(schedule.events).toHaveLength(0);
  });
});
