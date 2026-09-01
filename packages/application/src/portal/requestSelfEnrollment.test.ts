import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeIntakeRepository } from '../intake/intakeRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { requestSelfEnrollment } from './requestSelfEnrollment.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';

/**
 * §5.8 — o cliente escolhe a saída e quem vai, mas a inscrição **não nasce alocada**:
 * entra na fila de não processadas e a equipe revisa antes de virar inscrição no grupo
 * (decisão do dono do produto). Assim toda inscrição passa pelo mesmo funil, venha do
 * site ou do app.
 */

const clock = () => new Date('2026-08-28T10:00:00Z');

async function seed() {
  const customers = fakeCustomerRepository();
  const schedule = fakeScheduleRepository();
  const intake = fakeIntakeRepository();
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

  const head = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: null,
    fullName: 'Vanessa Santos',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1990-03-04'),
    email: 'vanessa@example.com',
    phone: '5548999990000',
    address: EMPTY_ADDRESS,
  });
  const filho = await customers.create({
    tenantId: 'tenant-a',
    responsibleId: head.id,
    fullName: 'Bruno Santos',
    cpf: parseCpf('277.373.070-44'),
    birthDate: parseLocalDate('2016-07-10'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });

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

  const ctx: RequestContext = {
    tenantId: 'tenant-a',
    actor: { kind: 'customer', customerId: head.id, userId: 'user-1' },
  };

  return { customers, schedule, intake, itineraries, head, filho, group, ctx, itin };
}

describe('§5.8: o cliente se inscreve e o pedido entra na fila', () => {
  it('cria o item da fila com os dados da família e o grupo escolhido', async () => {
    const { customers, schedule, intake, head, filho, group, ctx } = await seed();

    const result = await requestSelfEnrollment({ customers, schedule, intake, clock }, ctx, {
      groupId: group.id,
      participantCustomerIds: [head.id, filho.id],
    });

    expect(result.intakeId).toBeTruthy();
    const queue = await intake.listQueue('tenant-a');
    expect(queue).toHaveLength(1);
    expect(queue[0]!.responsibleName).toBe('Vanessa Santos');
    expect(queue[0]!.companionCount).toBe(1);

    // o pedido guarda a escolha do cliente: quem vai e em qual saída
    const stored = await intake.findForAllocation('tenant-a', result.intakeId);
    expect(stored).not.toBeNull();
    const payload = stored!.payload as {
      kind: string;
      groupId: string;
      headCustomerId: string;
      participantCustomerIds: string[];
    };
    expect(payload.kind).toBe('portal_enrollment');
    expect(payload.groupId).toBe(group.id);
    expect(payload.headCustomerId).toBe(head.id);
    expect(payload.participantCustomerIds).toEqual([head.id, filho.id]);
  });

  it('a origem é o portal — é ela que preserva o cashback na alocação (§5.8/CB-09)', async () => {
    const { customers, schedule, intake, head, group, ctx } = await seed();
    const result = await requestSelfEnrollment({ customers, schedule, intake, clock }, ctx, {
      groupId: group.id,
      participantCustomerIds: [head.id],
    });
    const stored = await intake.findForAllocation('tenant-a', result.intakeId);
    expect(stored!.source).toBe('portal');
  });

  it('recusa saída que não está na vitrine (fechada ou privada)', async () => {
    const { customers, schedule, intake, head, ctx, itin } = await seed();
    const { group: privado } = await schedule.createEventWithGroup(
      {
        tenantId: 'tenant-a',
        itineraryId: itin.id,
        startDate: parseLocalDate('2026-12-01'),
        endDate: parseLocalDate('2026-12-05'),
        title: null,
        notes: null,
        status: 'scheduled',
      },
      {
        name: 'Fechado',
        status: 'open',
        capacityVehicles: null,
        visibility: 'private',
        pricingMode: 'itinerary',
      },
    );

    await expect(
      requestSelfEnrollment({ customers, schedule, intake, clock }, ctx, {
        groupId: privado.id,
        participantCustomerIds: [head.id],
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('recusa participante de outra família, lista vazia e grupo inexistente', async () => {
    const { customers, schedule, intake, head, group, ctx } = await seed();
    const outro = await customers.create({
      tenantId: 'tenant-a',
      responsibleId: null,
      fullName: 'De Fora',
      cpf: parseCpf('900.000.100-57'),
      birthDate: parseLocalDate('1985-01-01'),
      email: 'fora@example.com',
      phone: '5548999990001',
      address: EMPTY_ADDRESS,
    });

    await expect(
      requestSelfEnrollment({ customers, schedule, intake, clock }, ctx, {
        groupId: group.id,
        participantCustomerIds: [head.id, outro.id],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      requestSelfEnrollment({ customers, schedule, intake, clock }, ctx, {
        groupId: group.id,
        participantCustomerIds: [],
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    await expect(
      requestSelfEnrollment({ customers, schedule, intake, clock }, ctx, {
        groupId: 'nao-existe',
        participantCustomerIds: [head.id],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a equipe não usa este caminho — ela aloca direto', async () => {
    const { customers, schedule, intake, head, group } = await seed();
    const teamCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'team', userId: 'u1', role: 'admin' },
    };
    await expect(
      requestSelfEnrollment({ customers, schedule, intake, clock }, teamCtx, {
        groupId: group.id,
        participantCustomerIds: [head.id],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
