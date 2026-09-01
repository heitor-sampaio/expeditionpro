import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { fakeIntakeRepository } from './intakeRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { listAllocationQueue } from './listAllocationQueue.js';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

const TENANT = 'tenant-a';
const NOW = () => new Date('2026-08-26T12:00:00Z');
const teamCtx: RequestContext = {
  tenantId: TENANT,
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const ITIN = 'itin-coxilha';

async function openGroup(
  schedule: ReturnType<typeof fakeScheduleRepository>,
  start: string,
  end: string,
  status = 'open',
) {
  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: TENANT,
      itineraryId: ITIN,
      startDate: parseLocalDate(start),
      endDate: parseLocalDate(end),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: `g-${start}`,
      status,
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );
  return group;
}

async function storeIntake(
  intake: ReturnType<typeof fakeIntakeRepository>,
  externalId: string,
  itineraryId: string | null,
) {
  return intake.store({
    tenantId: TENANT,
    source: 'wp_flat_v1',
    externalId,
    payload: {},
    normalized: null,
    formId: '4641',
    itineraryId,
    submittedAt: null,
    status: 'needs_allocation',
    error: null,
    isTest: false,
  });
}

describe('IN-20b: fila pré-seleciona o próximo grupo aberto do roteiro', () => {
  it('sugere o grupo aberto mais próximo no futuro do roteiro resolvido', async () => {
    const intake = fakeIntakeRepository();
    const schedule = fakeScheduleRepository();
    await openGroup(schedule, '2026-06-01', '2026-06-05'); // passado → não sugere
    const proximo = await openGroup(schedule, '2026-09-10', '2026-09-14'); // próximo aberto
    await openGroup(schedule, '2026-12-01', '2026-12-05'); // mais longe
    await storeIntake(intake, '4641:1', ITIN);

    const rows = await listAllocationQueue({ intake, schedule, clock: NOW }, teamCtx);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.suggestedGroupId).toBe(proximo.id);
    expect(rows[0]!.suggestedGroupName).toBe('g-2026-09-10');
  });

  it('ignora grupo não aberto: só grupo `open` vira sugestão', async () => {
    const intake = fakeIntakeRepository();
    const schedule = fakeScheduleRepository();
    await openGroup(schedule, '2026-09-10', '2026-09-14', 'draft'); // não conta
    const aberto = await openGroup(schedule, '2026-10-01', '2026-10-05', 'open');
    await storeIntake(intake, '4641:2', ITIN);

    const rows = await listAllocationQueue({ intake, schedule, clock: NOW }, teamCtx);
    expect(rows[0]!.suggestedGroupId).toBe(aberto.id);
  });

  it('sem grupo aberto futuro, a sugestão é null (admin escolhe)', async () => {
    const intake = fakeIntakeRepository();
    const schedule = fakeScheduleRepository();
    await openGroup(schedule, '2026-06-01', '2026-06-05'); // só passado
    await storeIntake(intake, '4641:3', ITIN);

    const rows = await listAllocationQueue({ intake, schedule, clock: NOW }, teamCtx);
    expect(rows[0]!.suggestedGroupId).toBeNull();
    expect(rows[0]!.suggestedGroupName).toBeNull();
  });

  it('intake sem roteiro resolvido não recebe sugestão', async () => {
    const intake = fakeIntakeRepository();
    const schedule = fakeScheduleRepository();
    await openGroup(schedule, '2026-09-10', '2026-09-14');
    await storeIntake(intake, '4641:4', null);

    const rows = await listAllocationQueue({ intake, schedule, clock: NOW }, teamCtx);
    expect(rows[0]!.suggestedGroupId).toBeNull();
  });

  it('a fila de alocação é da equipe (cliente recusado)', async () => {
    const intake = fakeIntakeRepository();
    const schedule = fakeScheduleRepository();
    const customerCtx: RequestContext = {
      tenantId: TENANT,
      actor: { kind: 'customer', customerId: 'c1', userId: 'auth-1' },
    };
    await expect(
      listAllocationQueue({ intake, schedule, clock: NOW }, customerCtx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
