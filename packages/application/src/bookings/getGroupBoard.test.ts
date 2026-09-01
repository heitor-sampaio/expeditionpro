import { describe, expect, it } from 'vitest';
import {
  cents,
  parseCpf,
  parseLocalDate,
  parsePlate,
  type PriceCategory,
} from '@expedition/domain';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from './bookingRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeVehicleRepository } from '../vehicles/vehicleRepository.fake.js';
import { getGroupBoard } from './getGroupBoard.js';
import { NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord } from './bookingRepository.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

async function seedGroup(capacityVehicles: number | null) {
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
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
      capacityVehicles,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );
  const payments = fakePaymentRepository(bookings.rows);
  const customers = fakeCustomerRepository();
  const vehicles = fakeVehicleRepository({
    brands: [{ id: 'brand-jeep', name: 'Jeep' }],
    models: [{ id: 'model-renegade', brandId: 'brand-jeep', name: 'Renegade' }],
  });
  return { schedule, bookings, payments, customers, vehicles, group };
}

function pushBooking(
  bookings: ReturnType<typeof fakeBookingRepository>,
  groupId: string,
  id: string,
  responsibleCustomerId: string,
  status: string,
  units: number[],
) {
  const record: BookingRecord = {
    id,
    groupId,
    responsibleCustomerId,
    status,
    source: 'manual',
    invoiceChecked: false,
    checkedInAt: null,
    participants: units.map((u, i) => ({
      id: `${id}-p${i}`,
      customerId: `${id}-c${i}`,
      priceCategory: 'COUPLE' as PriceCategory,
      unitPriceCents: cents(u),
      priceSource: 'auto',
      priceNote: null,
    })),
  };
  bookings.rows.push(record);
}

describe('GR-07/GR-13: leitura do grupo (Tabela 1)', () => {
  it('agrega contratado por linha e separa confirmado de projetado no rodapé', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(10);
    pushBooking(bookings, group.id, 'bk-c', 'resp-c', 'confirmed', [200000, 0]);
    pushBooking(bookings, group.id, 'bk-p', 'resp-p', 'pending', [120000, 40000]);
    pushBooking(bookings, group.id, 'bk-x', 'resp-x', 'cancelled', [999999]);

    const board = await getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });

    // a cancelada saiu da lista do grupo (GR-07); o registro vive na lista de inscrições
    expect(board.rows).toHaveLength(2);
    expect(board.rows.map((r) => r.bookingId)).not.toContain('bk-x');
    const confirmed = board.rows.find((r) => r.bookingId === 'bk-c')!;
    expect(confirmed.contractedCents).toBe(200000);
    expect(confirmed.occupiesVehicle).toBe(true);

    expect(board.totals.contractedConfirmedCents).toBe(200000);
    expect(board.totals.contractedProjectedCents).toBe(360000); // 200000 + 160000
    expect(board.totals.confirmedCount).toBe(1);
    expect(board.totals.pendingCount).toBe(1);
    // recebido ainda é zero (ledger só na Fase 3)
    expect(board.totals.receivedCents).toBe(0);
    expect(board.totals.dueProjectedCents).toBe(360000);
  });

  it('GR-07: recebido vem da soma dos recebimentos; a receber = contratado - recebido', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(10);
    pushBooking(bookings, group.id, 'bk-c', 'resp-c', 'confirmed', [200000, 0]);
    await payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: 'bk-c',
        paidAt: parseLocalDate('2026-01-10'),
        amountCents: cents(50000),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: null,
      },
      null,
    );

    const board = await getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });
    const line = board.rows.find((r) => r.bookingId === 'bk-c')!;
    expect(line.receivedCents).toBe(50000);
    expect(line.dueCents).toBe(150000);
    expect(board.totals.receivedCents).toBe(50000);
    expect(board.totals.dueConfirmedCents).toBe(150000);
  });

  it('GR-12: ocupação conta só confirmadas; vagas = capacidade - ocupadas', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(3);
    pushBooking(bookings, group.id, 'bk1', 'r1', 'confirmed', [100000]);
    pushBooking(bookings, group.id, 'bk2', 'r2', 'confirmed', [100000]);
    pushBooking(bookings, group.id, 'bk3', 'r3', 'pending', [100000]);

    const board = await getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });
    expect(board.occupancy.occupiedVehicles).toBe(2);
    expect(board.occupancy.vacancies).toBe(1);
  });

  it('capacidade nula = sem limite: vagas nulas', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(null);
    pushBooking(bookings, group.id, 'bk1', 'r1', 'confirmed', [100000]);
    const board = await getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });
    expect(board.occupancy.capacityVehicles).toBeNull();
    expect(board.occupancy.vacancies).toBeNull();
    expect(board.occupancy.occupiedVehicles).toBe(1);
  });

  it('grupo vazio: rodapé zerado, cabeçalho presente', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(10);
    const board = await getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });
    expect(board.rows).toEqual([]);
    expect(board.totals.contractedProjectedCents).toBe(0);
    expect(board.group.name).toBe('Coxilha Rica · 10/11/2025');
    expect(board.group.pricingMode).toBe('itinerary');
  });

  it('grupo inexistente é recusado', async () => {
    const { schedule, bookings, payments, customers, vehicles } = await seedGroup(10);
    await expect(
      getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
        groupId: 'nao-existe',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/**
 * GR-07 — cancelada **sai da lista do grupo**: quem cancelou não é mais participante da
 * saída (decisão do dono do produto). O registro não some — vai para o histórico, porque
 * o dinheiro recebido continua no ledger e a decisão precisa ser rastreável (IN-16).
 */
describe('GR-07: inscrição cancelada sai da mesa', () => {
  it('não aparece entre as inscrições do grupo', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(10);
    pushBooking(bookings, group.id, 'bk-ativa', 'resp-1', 'confirmed', [120000]);
    pushBooking(bookings, group.id, 'bk-cancelada', 'resp-2', 'cancelled', [120000]);

    const board = await getGroupBoard({ bookings, schedule, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });

    expect(board.rows.map((r) => r.bookingId)).toEqual(['bk-ativa']);
  });

  it('os totais e a ocupação seguem ignorando a cancelada', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(10);
    pushBooking(bookings, group.id, 'bk-ativa', 'resp-1', 'confirmed', [120000]);
    pushBooking(bookings, group.id, 'bk-cancelada', 'resp-2', 'cancelled', [999999]);

    const board = await getGroupBoard({ bookings, schedule, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });

    expect(board.totals.contractedConfirmedCents).toBe(120000);
    expect(board.totals.contractedProjectedCents).toBe(120000);
    expect(board.occupancy.occupiedVehicles).toBe(1);
  });
});

describe('GR-14: a mesa mostra o check-in e o carro de cada inscrição', () => {
  it('traz o carro do responsável — modelo do catálogo e placa', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(null);
    const dono = await customers.create({
      tenantId: ctx.tenantId,
      responsibleId: null,
      fullName: 'Vanessa Santos',
      cpf: parseCpf('153.509.460-56'),
      birthDate: parseLocalDate('1990-03-04'),
      email: 'v@example.com',
      phone: '5548999990000',
      address: EMPTY_ADDRESS,
    });
    await vehicles.createVehicle({
      tenantId: ctx.tenantId,
      customerId: dono.id,
      brandId: 'brand-jeep',
      modelId: 'model-renegade',
      brandOther: null,
      modelOther: null,
      needsCatalogReview: false,
      plate: parsePlate('MLA1B23'),
    });
    pushBooking(bookings, group.id, 'bk-1', dono.id, 'confirmed', [100000]);

    const board = await getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });
    expect(board.rows[0]!.vehicle).toEqual({ model: 'Jeep Renegade', plate: 'MLA1B23' });
  });

  it('sem carro cadastrado a linha diz null — a mesa mostra o traço', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(null);
    pushBooking(bookings, group.id, 'bk-1', 'sem-carro', 'confirmed', [100000]);
    const board = await getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });
    expect(board.rows[0]!.vehicle).toBeNull();
  });

  it('a linha carrega o instante do check-in', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(null);
    pushBooking(bookings, group.id, 'bk-1', 'resp', 'confirmed', [100000]);
    const embarque = new Date('2025-11-10T11:00:00.000Z');
    bookings.rows[0] = { ...bookings.rows[0]!, checkedInAt: embarque };
    const board = await getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });
    expect(board.rows[0]!.checkedInAt).toEqual(embarque);
  });
});

/**
 * GR-13 — o painel do grupo em quatro números, como o dono do produto pediu: o total das
 * inscrições, o que os clientes pagaram, o que falta e **o que sobrou no caixa** depois
 * das taxas do gateway.
 */
describe('GR-13/PG-08: o recebido é líquido; o que o cliente pagou fica ao lado', () => {
  it('soma o que o cliente pagou quando ele pagou mais do que quitou', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(null);
    pushBooking(bookings, group.id, 'bk-1', 'resp-1', 'confirmed', [200000]);
    await payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: 'bk-1',
        paidAt: parseLocalDate('2025-11-01'),
        amountCents: cents(200000),
        customerPaidCents: cents(212000),
        chargeId: 'charge-1',
        method: 'card',
        reference: 'pay_1',
        notes: null,
        createdBy: null,
      },
      null,
    );

    const board = await getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });

    // o que quita a inscrição
    expect(board.totals.receivedCents).toBe(200000);
    // o que saiu do bolso do cliente, para bater com o extrato do provedor
    expect(board.totals.customerPaidCents).toBe(212000);
  });

  it('lançamento manual não tem taxa: o cliente pagou o que quitou', async () => {
    const { schedule, bookings, payments, customers, vehicles, group } = await seedGroup(null);
    pushBooking(bookings, group.id, 'bk-1', 'resp-1', 'confirmed', [200000]);
    await payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: 'bk-1',
        paidAt: parseLocalDate('2025-11-01'),
        amountCents: cents(150000),
        method: 'cash',
        reference: null,
        notes: null,
        createdBy: 'u1',
      },
      null,
    );

    const board = await getGroupBoard({ schedule, bookings, payments, customers, vehicles }, ctx, {
      groupId: group.id,
    });

    expect(board.totals.receivedCents).toBe(150000);
    expect(board.totals.customerPaidCents).toBe(150000);
  });
});
