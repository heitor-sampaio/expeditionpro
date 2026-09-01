import { describe, expect, it, vi } from 'vitest';
import { parseCpf, parseLocalDate } from '@expedition/domain';
import type { CrewLead } from '../tenants/tenantRepository.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeTenantRepository } from '../tenants/tenantRepository.fake.js';
import { buildGroupRoomlist, type BuildGroupRoomlistDeps } from './buildGroupRoomlist.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';
import type { CustomerRecord } from '../customers/customerRepository.js';

/**
 * GR-15 — quem entra na roomlist. A régua é diferente da mesa: aqui só inscrição
 * **confirmada** aparece, os acompanhantes vêm da inscrição (não da família cadastrada)
 * e o condutor da empresa só é injetado no tenant que o declarou.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const NOW = new Date('2026-08-30T12:00:00.000Z');

const CPFS = ['11144477735', '52998224725', '39053344705', '04241588921', '90000010057'];

/** O condutor cadastrado em Configurações → Equipe (CF-05). */
const CREW: CrewLead = {
  fullName: 'Heitor de Oliveira Sampaio',
  cpf: parseCpf('90000010057'),
  birthDate: parseLocalDate('1989-01-14'),
  email: 'heitorosampaio@gmail.com',
  phone: '5548999998877',
  address: {
    street: 'Rua Luiz Pasteur',
    number: '509',
    district: 'Trindade',
    city: 'Florianópolis',
    state: 'SC',
    zip: '88036100',
  },
  vehicle: null,
  companions: [
    { fullName: 'Vanessa Marek Campesatto', birthDate: parseLocalDate('1983-03-30') },
    { fullName: 'Enzo Sampaio', birthDate: parseLocalDate('2018-08-02') },
  ],
};

async function setup(crew: CrewLead | null = null) {
  const customers = fakeCustomerRepository();
  const itineraries = fakeItineraryRepository();
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
  const audit = fakeAuditLogRepository();
  const tenants = fakeTenantRepository({
    name: 'Drakkar Expedições',
    cnpj: '12345678000199',
    slug: 'drk',
    logo: null,
  });
  if (crew) await tenants.saveCrewLead(ctx.tenantId, crew);

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
        coupleCents: 2_000_00 as never,
        soloCents: 1_200_00 as never,
        extraAdultCents: 800_00 as never,
        childMidCents: 600_00 as never,
        childYoungCents: 400_00 as never,
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

  const deps: BuildGroupRoomlistDeps = {
    schedule,
    bookings,
    customers,
    tenants,
    audit,
    clock: () => NOW,
  };

  return { deps, customers, bookings, audit, tenants, group };
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
    address:
      responsibleId === null ? { ...EMPTY_ADDRESS, city: 'Lages', state: 'SC' } : EMPTY_ADDRESS,
  });
}

/** Cria uma inscrição direto no fake, com o status pedido. */
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

describe('GR-15: só inscrição confirmada entra na roomlist', () => {
  it('pendente, cancelada e recusada ficam de fora', async () => {
    const s = await setup();
    const confirmada = await makeCustomer(s.customers, 'Ana Confirmada', CPFS[0]!, '1990-01-01');
    const pendente = await makeCustomer(s.customers, 'Beto Pendente', CPFS[1]!, '1991-01-01');
    const cancelada = await makeCustomer(s.customers, 'Caio Cancelado', CPFS[2]!, '1992-01-01');
    await makeBooking(s.bookings, s.group.id, confirmada, [], 'confirmed');
    await makeBooking(s.bookings, s.group.id, pendente, [], 'pending');
    await makeBooking(s.bookings, s.group.id, cancelada, [], 'cancelled');

    const view = await buildGroupRoomlist(s.deps, ctx, { groupId: s.group.id });

    expect(view.entries.map((entry) => entry.fullName)).toEqual(['Ana Confirmada']);
  });

  it('os acompanhantes são os participantes da inscrição, não a família inteira', async () => {
    const s = await setup();
    const responsible = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!, '1990-01-01');
    const foi = await makeCustomer(
      s.customers,
      'Filho Que Foi',
      CPFS[1]!,
      '2015-06-01',
      responsible.id,
    );
    // Cadastrado na família, mas fora desta saída (GR-02): não pode ir ao hotel.
    await makeCustomer(s.customers, 'Filho Que Ficou', CPFS[2]!, '2017-02-01', responsible.id);
    await makeBooking(s.bookings, s.group.id, responsible, [foi], 'confirmed');

    const view = await buildGroupRoomlist(s.deps, ctx, { groupId: s.group.id });

    expect(view.entries[0]?.companions.map((guest) => guest.fullName)).toEqual(['Filho Que Foi']);
  });

  it('grupo sem confirmada ainda devolve o documento, com o condutor cadastrado', async () => {
    const s = await setup(CREW);

    const view = await buildGroupRoomlist(s.deps, ctx, { groupId: s.group.id });

    expect(view.entries).toHaveLength(1);
    expect(view.entries[0]?.fullName).toBe('Heitor de Oliveira Sampaio');
  });
});

describe('CF-05: o condutor cadastrado abre o documento', () => {
  it('cadastrado, vai no registro 1', async () => {
    const s = await setup(CREW);
    const responsible = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!, '1990-01-01');
    await makeBooking(s.bookings, s.group.id, responsible, [], 'confirmed');

    const view = await buildGroupRoomlist(s.deps, ctx, { groupId: s.group.id });

    expect(view.entries.map((entry) => [entry.position, entry.fullName])).toEqual([
      [1, 'Heitor de Oliveira Sampaio'],
      [2, 'Ana Lima'],
    ]);
  });

  it('sem condutor cadastrado, o documento sai só com os clientes', async () => {
    const s = await setup();
    const responsible = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!, '1990-01-01');
    await makeBooking(s.bookings, s.group.id, responsible, [], 'confirmed');

    const view = await buildGroupRoomlist(s.deps, ctx, { groupId: s.group.id });

    expect(view.entries[0]?.fullName).toBe('Ana Lima');
    const dump = JSON.stringify(view);
    expect(dump).not.toContain('Heitor');
    expect(dump).not.toContain('900.000.100-57');
    expect(dump).not.toContain('Luiz Pasteur');
  });
});

describe('GR-15: leitura e cabeçalho', () => {
  it('carrega todos os clientes numa leitura só — nada de N+1', async () => {
    const s = await setup();
    const um = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!, '1990-01-01');
    const acompanhante = await makeCustomer(s.customers, 'Filho', CPFS[1]!, '2015-06-01', um.id);
    const dois = await makeCustomer(s.customers, 'Beto Souza', CPFS[2]!, '1988-03-03');
    await makeBooking(s.bookings, s.group.id, um, [acompanhante], 'confirmed');
    await makeBooking(s.bookings, s.group.id, dois, [], 'confirmed');

    const listByIds = vi.spyOn(s.customers, 'listByIds');
    const findById = vi.spyOn(s.customers, 'findById');
    await buildGroupRoomlist(s.deps, ctx, { groupId: s.group.id });

    expect(listByIds).toHaveBeenCalledTimes(1);
    expect(findById).not.toHaveBeenCalled();
  });

  it('monta cada registro pelo id, não pela ordem que o repositório devolveu', async () => {
    const s = await setup();
    const um = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!, '1990-01-01');
    const dois = await makeCustomer(s.customers, 'Beto Souza', CPFS[1]!, '1988-03-03');
    await makeBooking(s.bookings, s.group.id, um, [], 'confirmed');
    await makeBooking(s.bookings, s.group.id, dois, [], 'confirmed');
    // O repositório real não promete ordem: aqui ele devolve ao contrário de propósito.
    vi.spyOn(s.customers, 'listByIds').mockImplementation((tenantId, ids) =>
      Promise.resolve(
        [...ids]
          .reverse()
          .map((id) => s.customers.rows.find((row) => row.id === id))
          .filter((row): row is CustomerRecord => row !== undefined),
      ),
    );

    const view = await buildGroupRoomlist(s.deps, ctx, { groupId: s.group.id });

    expect(view.entries.map((entry) => entry.fullName)).toEqual(['Ana Lima', 'Beto Souza']);
  });

  it('o cabeçalho traz empresa, saída e período', async () => {
    const s = await setup();

    const view = await buildGroupRoomlist(s.deps, ctx, { groupId: s.group.id });

    expect(view.company).toMatchObject({ name: 'Drakkar Expedições', cnpj: '12345678000199' });
    expect(view.group.name).toBe('Coxilha Rica · 10/11/2026');
    expect(view.group.startDate).toEqual(parseLocalDate('2026-11-10'));
    expect(view.group.endDate).toEqual(parseLocalDate('2026-11-14'));
    expect(view.generatedAt).toEqual(NOW);
  });

  it('conta hóspedes somando responsável e acompanhantes de cada registro', async () => {
    const s = await setup();
    const um = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!, '1990-01-01');
    const filho = await makeCustomer(s.customers, 'Filho', CPFS[1]!, '2015-06-01', um.id);
    await makeBooking(s.bookings, s.group.id, um, [filho], 'confirmed');

    const view = await buildGroupRoomlist(s.deps, ctx, { groupId: s.group.id });

    expect(view.guestCount).toBe(2);
  });
});

describe('GR-15: quem pode gerar, e o rastro', () => {
  it('operator e viewer não geram — é exportação em massa de dado pessoal', async () => {
    const s = await setup();

    for (const role of ['operator', 'viewer'] as const) {
      await expect(
        buildGroupRoomlist(
          s.deps,
          { ...ctx, actor: { kind: 'team', userId: 'u2', role } },
          { groupId: s.group.id },
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('cliente não gera roomlist', async () => {
    const s = await setup();

    await expect(
      buildGroupRoomlist(
        s.deps,
        { ...ctx, actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } },
        { groupId: s.group.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('grupo inexistente responde não encontrado', async () => {
    const s = await setup();

    await expect(buildGroupRoomlist(s.deps, ctx, { groupId: 'group-999' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('§3.2.1: registra a geração na trilha, sem dado pessoal no diff', async () => {
    const s = await setup(CREW);
    const responsible = await makeCustomer(s.customers, 'Ana Lima', CPFS[0]!, '1990-01-01');
    await makeBooking(s.bookings, s.group.id, responsible, [], 'confirmed');

    await buildGroupRoomlist(s.deps, ctx, { groupId: s.group.id });

    const entry = s.audit.rows.find((row) => row.action === 'roomlist.generate');
    expect(entry).toMatchObject({
      entity: 'group',
      entityId: s.group.id,
      actorUserId: 'u1',
      diff: { entries: 2, guests: 4, leadApplied: true },
    });
    expect(JSON.stringify(entry?.diff)).not.toContain('Ana');
  });
});
