import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate, type PriceCategory } from '@expedition/domain';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeCustomerRepository } from './customerRepository.fake.js';
import { fakeCashbackRepository } from '../cashback/cashbackRepository.fake.js';
import { getCustomerFile } from './getCustomerFile.js';
import { NotFoundError, ForbiddenError } from '../errors.js';
import { EMPTY_ADDRESS } from './customerRepository.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord } from '../bookings/bookingRepository.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

async function seed() {
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
  const payments = fakePaymentRepository();
  const customers = fakeCustomerRepository();
  const cashback = fakeCashbackRepository();

  const responsible = await customers.create({
    tenantId: ctx.tenantId,
    responsibleId: null,
    fullName: 'Ana Prado',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1988-03-04'),
    email: 'ana@example.com',
    phone: '4899990000',
    address: EMPTY_ADDRESS,
  });
  const companion = await customers.create({
    tenantId: ctx.tenantId,
    responsibleId: responsible.id,
    fullName: 'Bruno Prado',
    cpf: parseCpf('277.373.070-44'),
    birthDate: parseLocalDate('1990-07-10'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });

  const { group } = await schedule.createEventWithGroup(
    {
      tenantId: ctx.tenantId,
      itineraryId: 'itin-1',
      startDate: parseLocalDate('2025-11-10'),
      endDate: parseLocalDate('2025-11-14'),
      title: null,
      notes: null,
      status: 'scheduled',
    },
    {
      name: 'Coxilha Rica · 10/11/2025',
      status: 'open',
      capacityVehicles: 10,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );

  return { schedule, bookings, payments, customers, cashback, responsible, companion, group };
}

function pushBooking(
  bookings: ReturnType<typeof fakeBookingRepository>,
  groupId: string,
  id: string,
  responsibleCustomerId: string,
  status: string,
  participantIds: string[],
  units: number[],
) {
  const record: BookingRecord = {
    checkedInAt: null,
    id,
    groupId,
    responsibleCustomerId,
    status,
    source: 'manual',
    invoiceChecked: false,
    participants: participantIds.map((customerId, i) => ({
      id: `${id}-p${i}`,
      customerId,
      priceCategory: 'COUPLE' as PriceCategory,
      unitPriceCents: cents(units[i]!),
      priceSource: 'auto',
      priceNote: null,
    })),
  };
  bookings.rows.push(record);
}

describe('CL-06: ficha do cliente (expedições, financeiro, cashback)', () => {
  it('monta expedições com contratado/recebido/a receber derivados e o saldo de cashback', async () => {
    const { schedule, bookings, payments, customers, cashback, responsible, companion, group } =
      await seed();
    pushBooking(
      bookings,
      group.id,
      'bk-1',
      responsible.id,
      'confirmed',
      [responsible.id, companion.id],
      [200000, 0],
    );
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
    await cashback.addEntry({
      tenantId: ctx.tenantId,
      customerId: responsible.id,
      bookingId: 'bk-1',
      type: 'accrual',
      amountCents: cents(5000),
      availableFrom: parseLocalDate('2025-11-15'),
      expiresAt: null,
      notes: null,
    });

    const file = await getCustomerFile({ customers, bookings, schedule, payments, cashback }, ctx, {
      customerId: responsible.id,
    });

    expect(file.customer.fullName).toBe('Ana Prado');
    expect(file.customer.role).toBe('responsible');
    expect(file.expeditions).toHaveLength(1);
    const trip = file.expeditions[0]!;
    expect(trip.groupName).toBe('Coxilha Rica · 10/11/2025');
    expect(trip.role).toBe('responsible');
    expect(trip.participantCount).toBe(2);
    expect(trip.contractedCents).toBe(200000);
    expect(trip.receivedCents).toBe(50000);
    expect(trip.dueCents).toBe(150000);
    expect(file.cashback.balanceCents).toBe(5000);
    expect(file.cashback.entries).toHaveLength(1);
  });

  it('lista a saída também quando o cliente é acompanhante, com papel companion', async () => {
    const { schedule, bookings, payments, customers, cashback, responsible, companion, group } =
      await seed();
    pushBooking(
      bookings,
      group.id,
      'bk-1',
      responsible.id,
      'confirmed',
      [responsible.id, companion.id],
      [200000, 0],
    );

    const file = await getCustomerFile({ customers, bookings, schedule, payments, cashback }, ctx, {
      customerId: companion.id,
    });

    expect(file.customer.role).toBe('companion');
    expect(file.expeditions).toHaveLength(1);
    expect(file.expeditions[0]!.role).toBe('companion');
  });

  it('saída cancelada não gera a receber (a receber = 0)', async () => {
    const { schedule, bookings, payments, customers, cashback, responsible, group } = await seed();
    pushBooking(
      bookings,
      group.id,
      'bk-x',
      responsible.id,
      'cancelled',
      [responsible.id],
      [200000],
    );

    const file = await getCustomerFile({ customers, bookings, schedule, payments, cashback }, ctx, {
      customerId: responsible.id,
    });
    const trip = file.expeditions[0]!;
    expect(trip.status).toBe('cancelled');
    expect(trip.dueCents).toBe(0);
  });

  it('cliente inexistente é recusado', async () => {
    const { schedule, bookings, payments, customers, cashback } = await seed();
    await expect(
      getCustomerFile({ customers, bookings, schedule, payments, cashback }, ctx, {
        customerId: 'nao-existe',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('CL-06/PC-05: o cliente lê a própria ficha, mas não a de outra família', async () => {
    const { schedule, bookings, payments, customers, cashback, responsible } = await seed();
    const customerCtx: RequestContext = {
      tenantId: ctx.tenantId,
      actor: { kind: 'customer', customerId: responsible.id, userId: 'cust-user-1' },
    };
    // a própria ficha resolve
    const own = await getCustomerFile(
      { customers, bookings, schedule, payments, cashback },
      customerCtx,
      { customerId: responsible.id },
    );
    expect(own.customer.id).toBe(responsible.id);

    // a de outra família é recusada
    const outsider = await customers.create({
      tenantId: ctx.tenantId,
      responsibleId: null,
      fullName: 'De Fora',
      cpf: parseCpf('500.400.300-91'),
      birthDate: parseLocalDate('1990-03-03'),
      email: null,
      phone: null,
      address: EMPTY_ADDRESS,
    });
    await expect(
      getCustomerFile({ customers, bookings, schedule, payments, cashback }, customerCtx, {
        customerId: outsider.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/**
 * A família na ficha é o que sustenta as ações de vínculo (CL-10) e o merge (CL-07):
 * sem saber quem é o responsável e quem são os irmãos, "tornar responsável levando
 * acompanhantes" não tem o que oferecer, e "vincular como acompanhante" não sabe que
 * um responsável com dependentes seria recusado.
 */
describe('CL-06/CL-10: a família na ficha', () => {
  it('responsável: sem responsável acima e com os próprios acompanhantes', async () => {
    const { schedule, bookings, payments, customers, cashback, responsible, companion } =
      await seed();

    const file = await getCustomerFile({ customers, bookings, schedule, payments, cashback }, ctx, {
      customerId: responsible.id,
    });

    expect(file.family.responsible).toBeNull();
    expect(file.family.companions.map((c) => c.id)).toEqual([companion.id]);
    expect(file.family.companions[0]!.fullName).toBe('Bruno Prado');
  });

  it('acompanhante: traz o responsável e os irmãos, sem ele mesmo na lista', async () => {
    const { schedule, bookings, payments, customers, cashback, responsible, companion } =
      await seed();
    const sibling = await customers.create({
      tenantId: ctx.tenantId,
      responsibleId: responsible.id,
      fullName: 'Clara Prado',
      cpf: parseCpf('387.897.740-94'),
      birthDate: parseLocalDate('2015-02-20'),
      email: null,
      phone: null,
      address: EMPTY_ADDRESS,
    });

    const file = await getCustomerFile({ customers, bookings, schedule, payments, cashback }, ctx, {
      customerId: companion.id,
    });

    expect(file.family.responsible).toEqual({ id: responsible.id, fullName: 'Ana Prado' });
    expect(file.family.companions.map((c) => c.id)).toEqual([sibling.id]);
  });
});

describe('GR-14: a ficha carrega o check-in da inscrição', () => {
  it('devolve o instante do embarque na expedição', async () => {
    const { schedule, bookings, payments, customers, cashback, responsible, group } = await seed();
    pushBooking(
      bookings,
      group.id,
      'bk-1',
      responsible.id,
      'confirmed',
      [responsible.id],
      [120000],
    );
    const embarque = new Date('2025-11-10T11:00:00.000Z');
    bookings.rows[0] = { ...bookings.rows[0]!, checkedInAt: embarque };

    const file = await getCustomerFile({ customers, bookings, schedule, payments, cashback }, ctx, {
      customerId: responsible.id,
    });

    expect(file.expeditions[0]!.checkedInAt).toEqual(embarque);
  });
});
