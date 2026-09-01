import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { fakeCashbackRepository } from '../cashback/cashbackRepository.fake.js';
import { allocateBooking, type AllocateBookingDeps } from './allocateBooking.js';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';
import type { CustomerRecord } from '../customers/customerRepository.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

// CPFs válidos distintos para os participantes.
const CPFS = ['90000010057', '11144477735', '52998224725', '39053344705'];

const PRICES = {
  validFrom: parseLocalDate('2025-01-01'),
  prices: {
    coupleCents: cents(200000),
    soloCents: cents(120000),
    extraAdultCents: cents(80000),
    childMidCents: cents(60000),
    childYoungCents: cents(40000),
  },
};

async function setup() {
  const customers = fakeCustomerRepository();
  const itineraries = fakeItineraryRepository();
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();

  const itinerary = await itineraries.create(
    {
      tenantId: ctx.tenantId,
      name: 'Coxilha Rica',
      slug: 'coxilha-rica',
      description: null,
      difficulty: null,
      status: 'active',
      kind: 'catalog',
      childYoungMaxAge: 5,
      childMidMaxAge: 10,
    },
    PRICES,
  );

  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: itinerary.id,
      startDate: parseLocalDate('2025-11-10'),
      endDate: parseLocalDate('2025-11-14'),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: 'Coxilha Rica · 10/11/2025',
      status: 'draft',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );

  const cashback = fakeCashbackRepository();
  const deps: AllocateBookingDeps = { customers, itineraries, schedule, bookings, cashback };
  return { deps, customers, itineraries, schedule, bookings, cashback, group };
}

async function makeCustomer(
  customers: ReturnType<typeof fakeCustomerRepository>,
  cpf: string,
  birth: string,
  responsibleId: string | null,
): Promise<CustomerRecord> {
  return customers.create({
    tenantId: ctx.tenantId,
    responsibleId,
    fullName: `Pessoa ${cpf}`,
    cpf: parseCpf(cpf),
    birthDate: parseLocalDate(birth),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
}

describe('GR-03/IN-18: alocação da inscrição congela categoria e valor por participante', () => {
  it('IN-07: a inscrição nasce pending', async () => {
    const { deps, customers, group } = await setup();
    const resp = await makeCustomer(customers, CPFS[0]!, '1989-01-14', null);

    const result = await allocateBooking(deps, ctx, {
      groupId: group.id,
      responsibleCustomerId: resp.id,
      participantCustomerIds: [resp.id],
      source: 'manual',
    });

    expect(result.booking.status).toBe('pending');
    expect(result.booking.source).toBe('manual');
  });

  it('CB-09/§5.8: origem `portal` congela a regra de cashback vigente na alocação', async () => {
    const { deps, customers, group } = await setup();
    await deps.cashback.saveConfig(ctx.tenantId, {
      enabled: true,
      mode: 'percent',
      value: 5,
      base: 'paid',
      releaseDays: 30,
      validityMonths: 12,
      maxRedemptionPct: 50,
    });
    const resp = await makeCustomer(customers, CPFS[0]!, '1989-01-14', null);

    const result = await allocateBooking(deps, ctx, {
      groupId: group.id,
      responsibleCustomerId: resp.id,
      participantCustomerIds: [resp.id],
      source: 'portal',
    });

    expect(result.booking.cashbackRuleSnapshot?.rule?.value).toBe(5);
    // muda a config depois: o snapshot na inscrição não muda (CB-09)
    await deps.cashback.saveConfig(ctx.tenantId, {
      enabled: true,
      mode: 'percent',
      value: 10,
      base: 'paid',
      releaseDays: 30,
      validityMonths: 12,
      maxRedemptionPct: 50,
    });
    expect(result.booking.cashbackRuleSnapshot?.rule?.value).toBe(5);
  });

  it('§5.8: origem `manual` (equipe) NÃO congela cashback, mesmo com o módulo ligado', async () => {
    const { deps, customers, group } = await setup();
    await deps.cashback.saveConfig(ctx.tenantId, {
      enabled: true,
      mode: 'percent',
      value: 5,
      base: 'paid',
      releaseDays: 30,
      validityMonths: 12,
      maxRedemptionPct: 50,
    });
    const resp = await makeCustomer(customers, CPFS[0]!, '1989-01-14', null);

    const result = await allocateBooking(deps, ctx, {
      groupId: group.id,
      responsibleCustomerId: resp.id,
      participantCustomerIds: [resp.id],
      source: 'manual',
    });

    expect(result.booking.cashbackRuleSnapshot?.rule).toBeNull();
  });

  it('GR-03: casal + criança — categorias e unitários congelados, total derivado bate', async () => {
    const { deps, customers, group } = await setup();
    const resp = await makeCustomer(customers, CPFS[0]!, '1989-01-14', null); // adulto
    const cony = await makeCustomer(customers, CPFS[1]!, '1990-05-20', resp.id); // adulto
    const kid = await makeCustomer(customers, CPFS[2]!, '2021-01-01', resp.id); // 4 -> young

    const result = await allocateBooking(deps, ctx, {
      groupId: group.id,
      responsibleCustomerId: resp.id,
      participantCustomerIds: [resp.id, cony.id, kid.id],
      source: 'manual',
    });

    const byCustomer = new Map(result.booking.participants.map((p) => [p.customerId, p]));
    expect(byCustomer.get(resp.id)!.priceCategory).toBe('COUPLE');
    expect(byCustomer.get(resp.id)!.unitPriceCents).toBe(200000);
    expect(byCustomer.get(cony.id)!.priceCategory).toBe('COUPLE');
    expect(byCustomer.get(cony.id)!.unitPriceCents).toBe(0);
    expect(byCustomer.get(kid.id)!.priceCategory).toBe('CHILD_YOUNG');
    expect(byCustomer.get(kid.id)!.unitPriceCents).toBe(40000);
    expect(result.totalCents).toBe(240000);
    expect(result.booking.participants.every((p) => p.priceSource === 'auto')).toBe(true);
  });

  it('§3.4: a idade é resolvida na data de início do grupo (10 anos vira adulto em 2026)', async () => {
    const { deps, customers, itineraries, schedule } = await setup();
    // grupo em 2026: quem tem 10 no grupo de 2025 vira 11 (adulto) aqui
    const itin = (await itineraries.list(ctx.tenantId))[0]!;
    const { group } = await schedule.createEventWithGroup(
      {
        tenantId: ctx.tenantId,
        itineraryId: itin.id,
        startDate: parseLocalDate('2026-06-01'),
        endDate: parseLocalDate('2026-06-05'),
        title: null,
        notes: null,
        status: 'scheduled',
      },
      {
        name: 'g2026',
        status: 'draft',
        capacityVehicles: null,
        visibility: 'public',
        pricingMode: 'itinerary',
      },
    );
    const solo = await makeCustomer(customers, CPFS[0]!, '2015-06-01', null); // 11 em 2026

    const result = await allocateBooking(deps, ctx, {
      groupId: group.id,
      responsibleCustomerId: solo.id,
      participantCustomerIds: [solo.id],
      source: 'manual',
    });
    expect(result.booking.participants[0]!.priceCategory).toBe('SOLO');
    expect(result.totalCents).toBe(120000);
  });

  it('IN-02: recusa segunda inscrição do mesmo responsável no grupo', async () => {
    const { deps, customers, group } = await setup();
    const resp = await makeCustomer(customers, CPFS[0]!, '1989-01-14', null);
    const cmd = {
      groupId: group.id,
      responsibleCustomerId: resp.id,
      participantCustomerIds: [resp.id],
      source: 'manual',
    };
    await allocateBooking(deps, ctx, cmd);
    await expect(allocateBooking(deps, ctx, cmd)).rejects.toMatchObject({
      code: 'already_allocated',
    });
  });

  it('recusa grupo inexistente', async () => {
    const { deps, customers } = await setup();
    const resp = await makeCustomer(customers, CPFS[0]!, '1989-01-14', null);
    await expect(
      allocateBooking(deps, ctx, {
        groupId: 'nao-existe',
        responsibleCustomerId: resp.id,
        participantCustomerIds: [resp.id],
        source: 'manual',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('recusa inscrição sem participantes', async () => {
    const { deps, customers, group } = await setup();
    const resp = await makeCustomer(customers, CPFS[0]!, '1989-01-14', null);
    await expect(
      allocateBooking(deps, ctx, {
        groupId: group.id,
        responsibleCustomerId: resp.id,
        participantCustomerIds: [],
        source: 'manual',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('recusa participante de outro tenant / inexistente', async () => {
    const { deps, customers, group } = await setup();
    const resp = await makeCustomer(customers, CPFS[0]!, '1989-01-14', null);
    await expect(
      allocateBooking(deps, ctx, {
        groupId: group.id,
        responsibleCustomerId: resp.id,
        participantCustomerIds: [resp.id, 'fantasma'],
        source: 'manual',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
