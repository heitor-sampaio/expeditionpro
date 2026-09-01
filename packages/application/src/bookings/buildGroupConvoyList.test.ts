import { describe, expect, it } from 'vitest';
import { parseCpf, parseLocalDate, parsePlate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeVehicleRepository } from '../vehicles/vehicleRepository.fake.js';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeTenantRepository } from '../tenants/tenantRepository.fake.js';
import { buildGroupConvoyList, type BuildGroupConvoyListDeps } from './buildGroupConvoyList.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';
import type { CustomerRecord } from '../customers/customerRepository.js';

/**
 * GR-17 — quem entra na lista do comboio. Uma linha por carro: o do condutor da empresa
 * à frente (CF-04), depois o de cada inscrição confirmada.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const NOW = new Date('2026-08-31T12:00:00.000Z');
const CPFS = ['11144477735', '52998224725', '39053344705'];

async function setup(convoyVehicle: { brand: string; model: string; plate: string } | null = null) {
  const customers = fakeCustomerRepository();
  const itineraries = fakeItineraryRepository();
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
  const vehicles = fakeVehicleRepository({
    brands: [{ id: 'brand-jeep', name: 'Jeep' }],
    models: [{ id: 'model-wrangler', brandId: 'brand-jeep', name: 'Wrangler' }],
  });
  const audit = fakeAuditLogRepository();
  const tenants = fakeTenantRepository();
  if (convoyVehicle) {
    await tenants.saveCrewLead(ctx.tenantId, {
      fullName: 'Heitor de Oliveira Sampaio',
      cpf: parseCpf('90000010057'),
      birthDate: parseLocalDate('1989-01-14'),
      email: null,
      phone: null,
      address: {
        street: null,
        number: null,
        district: null,
        city: null,
        state: null,
        zip: null,
      },
      vehicle: convoyVehicle,
      companions: [],
    });
  }

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
    {
      validFrom: parseLocalDate('2025-01-01'),
      prices: {
        coupleCents: 0 as never,
        soloCents: 0 as never,
        extraAdultCents: 0 as never,
        childMidCents: 0 as never,
        childYoungCents: 0 as never,
      },
    },
  );

  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: itinerary.id,
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

  const deps: BuildGroupConvoyListDeps = {
    schedule,
    bookings,
    customers,
    vehicles,
    tenants,
    audit,
    clock: () => NOW,
  };

  return { deps, customers, bookings, vehicles, audit, group };
}

async function makeCustomer(
  customers: ReturnType<typeof fakeCustomerRepository>,
  fullName: string,
  cpf: string,
): Promise<CustomerRecord> {
  return customers.create({
    tenantId: ctx.tenantId,
    responsibleId: null,
    fullName,
    cpf: parseCpf(cpf),
    birthDate: parseLocalDate('1990-01-01'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
}

async function makeBooking(
  bookings: ReturnType<typeof fakeBookingRepository>,
  groupId: string,
  responsible: CustomerRecord,
  status: string,
) {
  const booking = await bookings.create({
    tenantId: ctx.tenantId,
    groupId,
    responsibleCustomerId: responsible.id,
    status: 'pending',
    source: 'manual',
    participants: [
      {
        customerId: responsible.id,
        priceCategory: 'SOLO' as const,
        unitPriceCents: 0 as never,
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  });
  const index = bookings.rows.findIndex((row) => row.id === booking.id);
  bookings.rows[index] = { ...bookings.rows[index]!, status };
}

describe('GR-17: uma linha por carro', () => {
  it('traz o condutor e o veículo de cada inscrição confirmada', async () => {
    const s = await setup();
    const ana = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!);
    await makeBooking(s.bookings, s.group.id, ana, 'confirmed');
    await s.vehicles.createVehicle({
      tenantId: ctx.tenantId,
      customerId: ana.id,
      brandId: 'brand-jeep',
      modelId: 'model-wrangler',
      brandOther: null,
      modelOther: null,
      plate: parsePlate('ABC1D23'),
      needsCatalogReview: false,
    });

    const view = await buildGroupConvoyList(s.deps, ctx, { groupId: s.group.id });

    expect(view.rows).toEqual([
      { position: 1, driver: 'Ana Lima', brand: 'Jeep', model: 'Wrangler', plate: 'ABC1D23' },
    ]);
  });

  it('CF-04/CF-05: o carro do condutor cadastrado abre a lista', async () => {
    const s = await setup({ brand: 'Ford', model: 'Ranger', plate: 'SFG1H00' });
    const ana = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!);
    await makeBooking(s.bookings, s.group.id, ana, 'confirmed');

    const view = await buildGroupConvoyList(s.deps, ctx, { groupId: s.group.id });

    expect(view.rows.map((row) => [row.position, row.driver, row.plate])).toEqual([
      [1, 'Heitor de Oliveira Sampaio', 'SFG1H00'],
      [2, 'Ana Lima', '—'],
    ]);
  });

  it('sem veículo do condutor declarado, a lista abre com o primeiro cliente', async () => {
    const s = await setup(null);
    const ana = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!);
    await makeBooking(s.bookings, s.group.id, ana, 'confirmed');

    const view = await buildGroupConvoyList(s.deps, ctx, { groupId: s.group.id });

    expect(view.rows[0]?.driver).toBe('Ana Lima');
  });

  it('inscrição sem carro cadastrado aparece com os campos vazios', async () => {
    const s = await setup();
    const ana = await makeCustomer(s.customers, 'Ana Sem Carro', CPFS[0]!);
    await makeBooking(s.bookings, s.group.id, ana, 'confirmed');

    const view = await buildGroupConvoyList(s.deps, ctx, { groupId: s.group.id });

    expect(view.rows[0]).toMatchObject({
      driver: 'Ana Sem Carro',
      brand: '—',
      model: '—',
      plate: '—',
    });
  });

  it('só inscrição confirmada entra', async () => {
    const s = await setup();
    const ana = await makeCustomer(s.customers, 'Ana Confirmada', CPFS[0]!);
    const beto = await makeCustomer(s.customers, 'Beto Pendente', CPFS[1]!);
    await makeBooking(s.bookings, s.group.id, ana, 'confirmed');
    await makeBooking(s.bookings, s.group.id, beto, 'pending');

    const view = await buildGroupConvoyList(s.deps, ctx, { groupId: s.group.id });

    expect(view.rows.map((row) => row.driver)).toEqual(['Ana Confirmada']);
  });
});

describe('GR-17: quem gera, e o rastro', () => {
  it('operator não gera', async () => {
    const s = await setup();

    await expect(
      buildGroupConvoyList(
        s.deps,
        { ...ctx, actor: { kind: 'team', userId: 'u2', role: 'operator' } },
        { groupId: s.group.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('grupo inexistente responde não encontrado', async () => {
    const s = await setup();

    await expect(
      buildGroupConvoyList(s.deps, ctx, { groupId: 'group-999' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('§3.2.1: registra a geração com contagens, sem nome de ninguém', async () => {
    const s = await setup({ brand: 'Ford', model: 'Ranger', plate: 'SFG1H00' });
    const ana = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!);
    await makeBooking(s.bookings, s.group.id, ana, 'confirmed');

    await buildGroupConvoyList(s.deps, ctx, { groupId: s.group.id });

    const entry = s.audit.rows.find((row) => row.action === 'convoy.generate');
    expect(entry?.diff).toEqual({ vehicles: 2, leadApplied: true });
  });
});
