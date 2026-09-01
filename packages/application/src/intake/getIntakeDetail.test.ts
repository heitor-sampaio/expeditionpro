import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate, type MappedIntake } from '@expedition/domain';
import { fakeIntakeRepository } from './intakeRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeCashbackRepository } from '../cashback/cashbackRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { getIntakeDetail } from './getIntakeDetail.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';

/**
 * IN-17c — o que a equipe precisa ver antes de aprovar: quem é, que idade cada um terá
 * **na data da saída** (§3.4), quanto vai custar, se já é cliente e se tem cashback.
 * Sem isso a decisão é tomada no escuro ou pesquisando em três telas.
 */
const team: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const normalized = (): MappedIntake => ({
  formId: '4641',
  entryId: '101',
  submitted: null,
  desiredDate: parseLocalDate('2026-11-10'),
  responsible: {
    fullName: 'Rui Alves',
    cpf: parseCpf('529.982.247-25'),
    birthDate: parseLocalDate('1986-05-02'),
    email: 'rui@example.com',
    phone: '5548999887766',
  },
  address: EMPTY_ADDRESS,
  vehicle: null,
  companions: [
    {
      fullName: 'Lia Alves',
      cpf: parseCpf('153.509.460-56'),
      birthDate: parseLocalDate('2018-03-01'),
    },
  ],
  consent: true,
  warnings: [],
  customFields: {},
});

async function seed() {
  const intake = fakeIntakeRepository();
  const customers = fakeCustomerRepository();
  const cashback = fakeCashbackRepository();
  const schedule = fakeScheduleRepository();
  const itineraries = fakeItineraryRepository();

  const itin = await itineraries.create(
    {
      tenantId: 'tenant-a',
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
  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: 'tenant-a',
      itineraryId: itin.id,
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

  const stored = await intake.store({
    tenantId: 'tenant-a',
    source: 'wp_flat_v1',
    externalId: '4641:101',
    payload: {},
    normalized: normalized(),
    formId: '4641',
    itineraryId: itin.id,
    submittedAt: null,
    status: 'needs_allocation',
    error: null,
    isTest: false,
  });

  const deps = { intake, customers, cashback, schedule, itineraries };
  return { deps, intake, customers, cashback, group, stored };
}

describe('IN-17c: detalhe do item da fila', () => {
  it('mostra as pessoas com a idade na data da saída e o valor pelo algoritmo (§3.4)', async () => {
    const { deps, stored, group } = await seed();

    const detail = await getIntakeDetail(deps, team, { intakeId: stored.id, groupId: group.id });

    expect(detail.responsible.fullName).toBe('Rui Alves');
    expect(detail.responsible.phone).toBe('5548999887766');
    // 1986 → 40 anos em 10/11/2026; 2018 → 8 anos (criança faixa maior)
    expect(detail.responsible.age).toBe(40);
    expect(detail.companions[0]!.age).toBe(8);
    expect(detail.companions[0]!.band).toBe('child_mid');
    // solo (1 adulto) + criança maior
    expect(detail.quote?.totalCents).toBe(180000);
  });

  it('diz se o responsável já é cliente e qual o saldo de cashback', async () => {
    const { deps, customers, cashback, stored, group } = await seed();

    const semCadastro = await getIntakeDetail(deps, team, {
      intakeId: stored.id,
      groupId: group.id,
    });
    expect(semCadastro.responsible.existingCustomerId).toBeNull();
    expect(semCadastro.responsible.cashbackBalanceCents).toBe(0);

    const existente = await customers.create({
      tenantId: 'tenant-a',
      responsibleId: null,
      fullName: 'Rui Alves',
      cpf: parseCpf('529.982.247-25'),
      birthDate: parseLocalDate('1986-05-02'),
      email: 'rui@example.com',
      phone: '5548999887766',
      address: EMPTY_ADDRESS,
    });
    await cashback.addEntry({
      tenantId: 'tenant-a',
      customerId: existente.id,
      bookingId: null,
      type: 'adjustment',
      amountCents: cents(5000),
      availableFrom: null,
      expiresAt: null,
      notes: null,
      createdBy: null,
    });

    const comCadastro = await getIntakeDetail(deps, team, {
      intakeId: stored.id,
      groupId: group.id,
    });
    expect(comCadastro.responsible.existingCustomerId).toBe(existente.id);
    expect(comCadastro.responsible.cashbackBalanceCents).toBe(5000);
  });

  it('sem grupo escolhido não inventa valor nem idade de viagem', async () => {
    const { deps, stored } = await seed();
    const detail = await getIntakeDetail(deps, team, { intakeId: stored.id });
    expect(detail.quote).toBeNull();
    expect(detail.responsible.age).toBeNull();
  });

  it('é da equipe e o item precisa existir', async () => {
    const { deps, stored } = await seed();
    const customerCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: 'c1', userId: 'u9' },
    };
    await expect(
      getIntakeDetail(deps, customerCtx, { intakeId: stored.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getIntakeDetail(deps, team, { intakeId: 'nao-existe' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
