import { describe, expect, it } from 'vitest';
import { cents, parseLocalDate } from '@expedition/domain';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeScheduleRepository } from './scheduleRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { updateScheduleEvent } from './updateScheduleEvent.js';
import { deleteScheduleEvent } from './deleteScheduleEvent.js';
import { cancelGroup } from './cancelGroup.js';
import { fakeSupplierRepository } from '../suppliers/supplierRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeIntakeRepository } from '../intake/intakeRepository.fake.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord } from '../bookings/bookingRepository.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const PRICE = {
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
  const itineraries = fakeItineraryRepository();
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
  const suppliers = fakeSupplierRepository();
  const payments = fakePaymentRepository(bookings.rows);
  const intake = fakeIntakeRepository();
  const audit = fakeAuditLogRepository();
  const itin = await itineraries.create(
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
    PRICE,
  );
  const { event, group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: itin.id,
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
  return {
    itineraries,
    schedule,
    bookings,
    suppliers,
    payments,
    intake,
    audit,
    itin,
    event,
    group,
  };
}

function pushBooking(
  bookings: ReturnType<typeof fakeBookingRepository>,
  groupId: string,
  status = 'pending',
) {
  const record: BookingRecord = {
    id: 'bk-1',
    groupId,
    responsibleCustomerId: 'resp',
    status,
    source: 'manual',
    invoiceChecked: false,
    participants: [],
  };
  bookings.rows.push(record);
}

describe('AG-04: edição do evento propaga ao grupo', () => {
  it('muda a data e o nome derivado do grupo acompanha', async () => {
    const { schedule, itineraries, event } = await setup();
    const result = await updateScheduleEvent({ schedule, itineraries }, ctx, {
      eventId: event.id,
      startDate: '2025-12-01',
      endDate: '2025-12-05',
    });
    expect(result.event.startDate).toEqual(parseLocalDate('2025-12-01'));
    expect(result.group.name).toBe('Coxilha Rica · 01/12/2025');
  });

  it('título explícito vira o nome do grupo', async () => {
    const { schedule, itineraries, event } = await setup();
    const result = await updateScheduleEvent({ schedule, itineraries }, ctx, {
      eventId: event.id,
      title: 'Turma da firma',
    });
    expect(result.group.name).toBe('Turma da firma');
  });

  it('recusa término anterior ao início', async () => {
    const { schedule, itineraries, event } = await setup();
    await expect(
      updateScheduleEvent({ schedule, itineraries }, ctx, {
        eventId: event.id,
        startDate: '2025-12-10',
        endDate: '2025-12-01',
      }),
    ).rejects.toMatchObject({ code: 'invalid_date_range' });
  });

  it('evento inexistente é recusado', async () => {
    const { schedule, itineraries } = await setup();
    await expect(
      updateScheduleEvent({ schedule, itineraries }, ctx, { eventId: 'nao-existe', notes: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('AG-05: exclusão bloqueada quando o grupo tem inscrições', () => {
  it('exclui o evento (e o grupo cai por cascade) quando não há inscrições', async () => {
    const { schedule, bookings, suppliers, payments, intake, event } = await setup();
    await deleteScheduleEvent(
      { schedule, bookings, suppliers, payments, intake, audit: fakeAuditLogRepository() },
      ctx,
      {
        eventId: event.id,
      },
    );
    expect(await schedule.findEventById(ctx.tenantId, event.id)).toBeNull();
  });

  it('bloqueia a exclusão quando o grupo tem inscrição, oferecendo cancelamento', async () => {
    const { schedule, bookings, suppliers, payments, intake, event, group } = await setup();
    pushBooking(bookings, group.id);
    await expect(
      deleteScheduleEvent(
        { schedule, bookings, suppliers, payments, intake, audit: fakeAuditLogRepository() },
        ctx,
        {
          eventId: event.id,
        },
      ),
    ).rejects.toMatchObject({ code: 'group_has_bookings' });
    // não apagou
    expect(await schedule.findEventById(ctx.tenantId, event.id)).not.toBeNull();
  });

  it('evento inexistente é recusado', async () => {
    const { schedule, bookings, suppliers, payments, intake } = await setup();
    await expect(
      deleteScheduleEvent(
        { schedule, bookings, suppliers, payments, intake, audit: fakeAuditLogRepository() },
        ctx,
        {
          eventId: 'nao-existe',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/**
 * AG-05 — a régua decidida com o dono do produto: grupo **sem nenhum lançamento**
 * (inscrição, recebimento ou gasto com fornecedor) pode ser excluído; com lançamento,
 * só cancelado — a saída não some. Devolução e cashback são avaliados caso a caso pela
 * equipe, então o cancelamento **não** mexe em dinheiro nem nas inscrições.
 */
describe('AG-05: gasto contratado não bloqueia; gasto pago bloqueia', () => {
  it('despesa lançada e não paga não impede a exclusão — é compromisso, não caixa', async () => {
    const { schedule, bookings, suppliers, payments, intake, event, group } = await setup();
    const supplier = await suppliers.createSupplier({
      tenantId: ctx.tenantId,
      name: 'Pousada da Serra',
      doc: null,
      docType: null,
      phone: null,
      email: null,
      notes: null,
      categoryId: null,
    });
    await suppliers.addExpense({
      tenantId: ctx.tenantId,
      groupId: group.id,
      supplierId: supplier.id,
      description: 'Hospedagem',
      totalCents: cents(80000),
    });

    await deleteScheduleEvent(
      { schedule, bookings, suppliers, payments, intake, audit: fakeAuditLogRepository() },
      ctx,
      {
        eventId: event.id,
      },
    );
    expect(await schedule.findEventById(ctx.tenantId, event.id)).toBeNull();
  });

  it('pagamento ao fornecedor impede: é dinheiro que saiu', async () => {
    const { schedule, bookings, suppliers, payments, intake, event, group } = await setup();
    const supplier = await suppliers.createSupplier({
      tenantId: ctx.tenantId,
      name: 'Pousada da Serra',
      doc: null,
      docType: null,
      phone: null,
      email: null,
      notes: null,
      categoryId: null,
    });
    const expense = await suppliers.addExpense({
      tenantId: ctx.tenantId,
      groupId: group.id,
      supplierId: supplier.id,
      description: 'Hospedagem',
      totalCents: cents(80000),
    });
    await suppliers.addPayment({
      tenantId: ctx.tenantId,
      supplierExpenseId: expense.id,
      paidAt: parseLocalDate('2025-10-01'),
      amountCents: cents(40000),
      method: 'pix',
      reference: null,
      notes: null,
      createdBy: null,
    });

    await expect(
      deleteScheduleEvent(
        { schedule, bookings, suppliers, payments, intake, audit: fakeAuditLogRepository() },
        ctx,
        {
          eventId: event.id,
        },
      ),
    ).rejects.toMatchObject({ code: 'group_has_money' });
  });
});

describe('AG-05: cancelar a saída', () => {
  it('marca o grupo como cancelado, com motivo, e registra na auditoria', async () => {
    const { schedule, audit, group } = await setup();

    const cancelled = await cancelGroup({ schedule, audit }, ctx, {
      groupId: group.id,
      reason: 'Estrada interditada',
    });

    expect(cancelled.status).toBe('cancelled');
    const entry = audit.rows[0]!;
    expect(entry.action).toBe('group.cancel');
    expect(entry.entityId).toBe(group.id);
    expect(entry.diff).toEqual({ from: 'draft', reason: 'Estrada interditada' });
  });

  it('não mexe nas inscrições — devolução e cashback são caso a caso', async () => {
    const { schedule, bookings, audit, group } = await setup();
    pushBooking(bookings, group.id);

    await cancelGroup({ schedule, audit }, ctx, { groupId: group.id, reason: 'Chuva' });

    const rows = await bookings.listByGroup(ctx.tenantId, group.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('pending'); // segue como estava, para a equipe decidir
  });

  it('exige motivo e recusa cancelar duas vezes', async () => {
    const { schedule, audit, group } = await setup();
    await expect(
      cancelGroup({ schedule, audit }, ctx, { groupId: group.id, reason: '  ' }),
    ).rejects.toMatchObject({ code: 'required_field' });

    await cancelGroup({ schedule, audit }, ctx, { groupId: group.id, reason: 'Chuva' });
    await expect(
      cancelGroup({ schedule, audit }, ctx, { groupId: group.id, reason: 'De novo' }),
    ).rejects.toMatchObject({ code: 'already_cancelled' });
  });

  it('cancelar é de owner/admin e o grupo precisa existir', async () => {
    const { schedule, audit, group } = await setup();
    const operator: RequestContext = {
      tenantId: ctx.tenantId,
      actor: { kind: 'team', userId: 'u2', role: 'operator' },
    };
    await expect(
      cancelGroup({ schedule, audit }, operator, { groupId: group.id, reason: 'Chuva' }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      cancelGroup({ schedule, audit }, ctx, { groupId: 'nao-existe', reason: 'Chuva' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/**
 * AG-05 — a régua afinada com o dono do produto: o que impede excluir é **inscrição ativa**
 * ou **dinheiro movimentado** (recebido de cliente, pago a fornecedor). Inscrição cancelada
 * sem dinheiro não segura a saída: ela já saiu do grupo e o registro vive na lista de
 * inscrições.
 */
describe('AG-05: o que impede excluir a saída', () => {
  it('inscrição cancelada e sem recebimento não impede', async () => {
    const { schedule, bookings, suppliers, payments, intake, event, group } = await setup();
    pushBooking(bookings, group.id, 'cancelled');

    await deleteScheduleEvent(
      { schedule, bookings, suppliers, payments, intake, audit: fakeAuditLogRepository() },
      ctx,
      {
        eventId: event.id,
      },
    );
    expect(await schedule.findEventById(ctx.tenantId, event.id)).toBeNull();
  });

  it('recebimento lançado impede, mesmo com a inscrição cancelada', async () => {
    const { schedule, bookings, suppliers, payments, intake, event, group } = await setup();
    pushBooking(bookings, group.id, 'cancelled');
    await payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: 'bk-1',
        paidAt: parseLocalDate('2025-10-01'),
        amountCents: cents(50000),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: null,
      },
      null,
    );

    await expect(
      deleteScheduleEvent(
        { schedule, bookings, suppliers, payments, intake, audit: fakeAuditLogRepository() },
        ctx,
        {
          eventId: event.id,
        },
      ),
    ).rejects.toMatchObject({ code: 'group_has_money' });
  });
});

/**
 * §5.8 — excluir a saída descarta os **pedidos do app** que apontavam para ela. Sem isso o
 * pedido fica órfão: o cliente segue vendo "em análise" por uma saída que não existe, e o
 * admin não tem o que aprovar.
 */
describe('AG-05: excluir a saída descarta os pedidos feitos para ela', () => {
  it('marca o pedido do portal como descartado', async () => {
    const { schedule, bookings, suppliers, payments, intake, event, group } = await setup();
    const pedido = await intake.store({
      tenantId: ctx.tenantId,
      source: 'portal',
      externalId: null,
      payload: {
        kind: 'portal_enrollment',
        groupId: group.id,
        headCustomerId: 'cust-1',
        participantCustomerIds: ['cust-1'],
      },
      normalized: null,
      formId: null,
      submittedAt: null,
      status: 'needs_allocation',
      error: null,
      isTest: false,
    });

    await deleteScheduleEvent(
      { schedule, bookings, suppliers, payments, intake, audit: fakeAuditLogRepository() },
      ctx,
      {
        eventId: event.id,
      },
    );

    const queue = await intake.listQueue(ctx.tenantId);
    expect(queue.map((i) => i.id)).not.toContain(pedido.id);
  });
});
