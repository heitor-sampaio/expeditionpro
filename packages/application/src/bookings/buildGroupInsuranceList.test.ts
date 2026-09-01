import { describe, expect, it } from 'vitest';
import { parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeTenantRepository } from '../tenants/tenantRepository.fake.js';
import {
  buildGroupInsuranceList,
  type BuildGroupInsuranceListDeps,
} from './buildGroupInsuranceList.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';
import type { CustomerRecord } from '../customers/customerRepository.js';

/**
 * GR-16 — quem entra na planilha do seguro. Mesma régua de confirmadas da roomlist, mas
 * **uma linha por pessoa** e **sem o condutor da empresa**: ele tem seguro próprio.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const NOW = new Date('2026-08-31T12:00:00.000Z');
const CPFS = ['11144477735', '52998224725', '39053344705', '04241588921'];

async function setup() {
  const customers = fakeCustomerRepository();
  const itineraries = fakeItineraryRepository();
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
  const audit = fakeAuditLogRepository();
  // Tenant do condutor fixo: prova que ele NÃO entra no seguro.
  const tenants = fakeTenantRepository({
    name: 'Drakkar Expedições',
    cnpj: null,
    slug: 'drk',
    logo: null,
  });

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

  const deps: BuildGroupInsuranceListDeps = {
    schedule,
    bookings,
    customers,
    tenants,
    audit,
    clock: () => NOW,
  };

  return { deps, customers, bookings, audit, group };
}

async function makeCustomer(
  customers: ReturnType<typeof fakeCustomerRepository>,
  fullName: string,
  cpf: string,
  birth: string,
  responsibleId: string | null = null,
): Promise<CustomerRecord> {
  return customers.create({
    tenantId: ctx.tenantId,
    responsibleId,
    fullName,
    cpf: parseCpf(cpf),
    birthDate: parseLocalDate(birth),
    email: responsibleId === null ? 'contato@example.com' : null,
    phone: responsibleId === null ? '+5548999998888' : null,
    address: EMPTY_ADDRESS,
  });
}

async function makeBooking(
  bookings: ReturnType<typeof fakeBookingRepository>,
  groupId: string,
  responsible: CustomerRecord,
  companions: readonly CustomerRecord[],
  status: string,
) {
  const booking = await bookings.create({
    tenantId: ctx.tenantId,
    groupId,
    responsibleCustomerId: responsible.id,
    status: 'pending',
    source: 'manual',
    participants: [responsible, ...companions].map((person) => ({
      customerId: person.id,
      priceCategory: 'COUPLE' as const,
      unitPriceCents: 0 as never,
      priceSource: 'auto',
      priceNote: null,
    })),
  });
  const index = bookings.rows.findIndex((row) => row.id === booking.id);
  bookings.rows[index] = { ...bookings.rows[index]!, status };
  return booking;
}

describe('GR-16: uma linha por pessoa inscrita', () => {
  it('responsável e acompanhantes viram linhas separadas', async () => {
    const s = await setup();
    const responsible = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!, '1990-05-20');
    const filho = await makeCustomer(
      s.customers,
      'Filho Lima',
      CPFS[1]!,
      '2015-06-01',
      responsible.id,
    );
    await makeBooking(s.bookings, s.group.id, responsible, [filho], 'confirmed');

    const view = await buildGroupInsuranceList(s.deps, ctx, { groupId: s.group.id });

    expect(view.rows.map((row) => row.fullName)).toEqual(['Ana Lima', 'Filho Lima']);
    expect(view.rows[0]?.cpf).toBe(CPFS[0]);
    expect(view.rows[0]?.phone).toBe('(48)999998888');
    expect(view.rows[1]?.email).toBe('');
  });

  it('o condutor da empresa não entra — ele tem seguro próprio', async () => {
    const s = await setup();
    const responsible = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!, '1990-05-20');
    await makeBooking(s.bookings, s.group.id, responsible, [], 'confirmed');

    const view = await buildGroupInsuranceList(s.deps, ctx, { groupId: s.group.id });

    expect(view.rows).toHaveLength(1);
    const dump = JSON.stringify(view);
    expect(dump).not.toContain('Heitor');
    expect(dump).not.toContain('90000010057');
  });

  it('só inscrição confirmada entra', async () => {
    const s = await setup();
    const confirmada = await makeCustomer(s.customers, 'Ana Confirmada', CPFS[0]!, '1990-01-01');
    const pendente = await makeCustomer(s.customers, 'Beto Pendente', CPFS[1]!, '1991-01-01');
    const cancelada = await makeCustomer(s.customers, 'Caio Cancelado', CPFS[2]!, '1992-01-01');
    await makeBooking(s.bookings, s.group.id, confirmada, [], 'confirmed');
    await makeBooking(s.bookings, s.group.id, pendente, [], 'pending');
    await makeBooking(s.bookings, s.group.id, cancelada, [], 'cancelled');

    const view = await buildGroupInsuranceList(s.deps, ctx, { groupId: s.group.id });

    expect(view.rows.map((row) => row.fullName)).toEqual(['Ana Confirmada']);
  });

  it('grupo sem confirmada devolve planilha sem linhas, não erro', async () => {
    const s = await setup();

    const view = await buildGroupInsuranceList(s.deps, ctx, { groupId: s.group.id });

    expect(view.rows).toEqual([]);
    expect(view.group.name).toBe('Coxilha Rica · 10/11/2026');
  });
});

describe('GR-16: quem gera, e o rastro', () => {
  it('operator não gera — é exportação de CPF em massa', async () => {
    const s = await setup();

    await expect(
      buildGroupInsuranceList(
        s.deps,
        { ...ctx, actor: { kind: 'team', userId: 'u2', role: 'operator' } },
        { groupId: s.group.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não gera', async () => {
    const s = await setup();

    await expect(
      buildGroupInsuranceList(
        s.deps,
        { ...ctx, actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } },
        { groupId: s.group.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('grupo inexistente responde não encontrado', async () => {
    const s = await setup();

    await expect(
      buildGroupInsuranceList(s.deps, ctx, { groupId: 'group-999' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('§3.2.1: registra a geração sem dado pessoal no diff', async () => {
    const s = await setup();
    const responsible = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!, '1990-05-20');
    await makeBooking(s.bookings, s.group.id, responsible, [], 'confirmed');

    await buildGroupInsuranceList(s.deps, ctx, { groupId: s.group.id });

    const entry = s.audit.rows.find((row) => row.action === 'insurance.generate');
    expect(entry).toMatchObject({ entity: 'group', entityId: s.group.id, diff: { people: 1 } });
    expect(JSON.stringify(entry?.diff)).not.toContain('Ana');
  });
});
