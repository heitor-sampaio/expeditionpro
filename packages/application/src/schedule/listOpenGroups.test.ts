import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { fakeScheduleRepository } from './scheduleRepository.fake.js';
import { listOpenGroups } from './listOpenGroups.js';

async function seed(status: string, visibility: string) {
  const schedule = fakeScheduleRepository();
  await schedule.createEventWithGroup(
    {
      tenantId: 'tenant-a',
      itineraryId: 'itin-1',
      startDate: parseLocalDate('2026-06-10'),
      endDate: parseLocalDate('2026-06-14'),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    { name: 'Coxilha', status, visibility, capacityVehicles: null, pricingMode: 'itinerary' },
  );
  return schedule;
}

describe('IN-24: listOpenGroups — vitrine pública', () => {
  it('devolve grupos open + public', async () => {
    const schedule = await seed('open', 'public');
    const groups = await listOpenGroups({ schedule }, 'drk');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.startDate).toEqual(parseLocalDate('2026-06-10'));
  });

  it('não expõe grupo draft', async () => {
    const schedule = await seed('draft', 'public');
    expect(await listOpenGroups({ schedule }, 'drk')).toHaveLength(0);
  });

  it('não expõe grupo privado', async () => {
    const schedule = await seed('open', 'private');
    expect(await listOpenGroups({ schedule }, 'drk')).toHaveLength(0);
  });
});
