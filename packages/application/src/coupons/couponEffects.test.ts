import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeCashbackRepository } from '../cashback/cashbackRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeVehicleRepository } from '../vehicles/vehicleRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeCouponRepository } from './couponRepository.fake.js';
import { allocateBooking } from '../bookings/allocateBooking.js';
import { getGroupBoard } from '../bookings/getGroupBoard.js';
import { listRecentBookings } from '../bookings/listRecentBookings.js';
import { cancelBooking } from '../bookings/cancelBooking.js';
import { accrueCashback } from '../cashback/accrueCashback.js';
import { applyCouponToBooking } from './applyCouponToBooking.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';

/**
 * O desconto atravessando o sistema. O cupom não serve de nada se a mesa, o financeiro
 * e o cashback continuarem somando os unitários por conta própria — este arquivo é a
 * prova de que a derivação passou a ter um dono só (CP-05 · CP-08 · CP-09).
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const NOW = new Date('2026-08-30T12:00:00.000Z');

/**
 * `cashbackPercent` liga o módulo **antes** da alocação e usa a origem `portal`: é a
 * única que gera crédito (§5.8), e a regra é congelada no ato (CB-09).
 */
async function setup(cashbackPercent?: number) {
  const customers = fakeCustomerRepository();
  const itineraries = fakeItineraryRepository();
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
  const cashback = fakeCashbackRepository();
  const payments = fakePaymentRepository(bookings.rows);
  const vehicles = fakeVehicleRepository();
  const coupons = fakeCouponRepository(bookings.rows);
  const audit = fakeAuditLogRepository();

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
        coupleCents: cents(2_000_00),
        soloCents: cents(1_200_00),
        extraAdultCents: cents(800_00),
        childMidCents: cents(600_00),
        childYoungCents: cents(400_00),
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

  const responsible = await customers.create({
    tenantId: ctx.tenantId,
    responsibleId: null,
    fullName: 'Heitor Sampaio',
    cpf: parseCpf('90000010057'),
    birthDate: parseLocalDate('1985-03-02'),
    email: 'heitor@example.com',
    phone: '+5548999999999',
    address: EMPTY_ADDRESS,
  });
  const spouse = await customers.create({
    tenantId: ctx.tenantId,
    responsibleId: responsible.id,
    fullName: 'Vanessa Sampaio',
    cpf: parseCpf('11144477735'),
    birthDate: parseLocalDate('1987-07-19'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });

  if (cashbackPercent !== undefined) {
    await cashback.saveConfig(ctx.tenantId, {
      enabled: true,
      mode: 'percent',
      value: cashbackPercent,
      base: 'contracted',
      releaseDays: 0,
      validityMonths: 0,
      maxRedemptionPct: 0,
    });
  }

  const { booking } = await allocateBooking(
    { bookings, schedule, itineraries, customers, cashback },
    ctx,
    {
      groupId: group.id,
      responsibleCustomerId: responsible.id,
      participantCustomerIds: [responsible.id, spouse.id],
      source: cashbackPercent === undefined ? 'manual' : 'portal',
    },
  );

  await coupons.create({
    tenantId: ctx.tenantId,
    code: 'VERAO10',
    description: null,
    mode: 'percent',
    value: 10,
    active: true,
    validFrom: null,
    validUntil: null,
    maxUses: null,
    maxUsesPerCustomer: null,
    itineraryId: null,
    groupId: null,
    customerId: null,
    createdBy: 'u1',
  });

  const applyDeps = { coupons, bookings, schedule, payments, audit, clock: () => NOW };

  return {
    customers,
    itineraries,
    schedule,
    bookings,
    cashback,
    payments,
    vehicles,
    coupons,
    audit,
    applyDeps,
    booking,
    group,
    responsible,
  };
}

describe('CP-05: o desconto chega às leituras de dinheiro', () => {
  it('a Tabela 1 do grupo mostra o contratado já com desconto', async () => {
    const s = await setup();
    await applyCouponToBooking(s.applyDeps, ctx, {
      bookingId: s.booking.id,
      code: 'VERAO10',
    });

    const board = await getGroupBoard(
      {
        schedule: s.schedule,
        bookings: s.bookings,
        payments: s.payments,
        customers: s.customers,
        vehicles: s.vehicles,
      },
      ctx,
      { groupId: s.group.id },
    );

    const row = board.rows[0]!;
    expect(row.contractedCents).toBe(1_800_00);
    expect(row.dueCents).toBe(1_800_00);
    // A mesa precisa dizer QUAL cupom baixou o valor. Desde que a equipe deixou de
    // aplicar cupom à mão, esta é a única coisa que explica a linha valendo menos que
    // a tabela — sem ela, o número aparece sem causa.
    expect(row.coupon).toMatchObject({ code: 'VERAO10', discountCents: 200_00 });
    expect(board.totals.contractedProjectedCents).toBe(1_800_00);
  });

  it('a lista de inscrições recentes traz o mesmo número da mesa', async () => {
    const s = await setup();
    await applyCouponToBooking(s.applyDeps, ctx, {
      bookingId: s.booking.id,
      code: 'VERAO10',
    });

    const recent = await listRecentBookings(
      { bookings: s.bookings, schedule: s.schedule, customers: s.customers },
      ctx,
      {},
    );

    expect(recent[0]?.contractedCents).toBe(1_800_00);
  });
});

describe('CP-09: o cashback é calculado sobre o contratado com desconto', () => {
  it('crédito de 10% sai sobre o valor descontado, não sobre o cheio', async () => {
    const s = await setup(10);
    await applyCouponToBooking(s.applyDeps, ctx, {
      bookingId: s.booking.id,
      code: 'VERAO10',
    });
    await s.bookings.confirmManually(ctx.tenantId, s.booking.id, {
      confirmedBy: 'u1',
      confirmedAt: NOW,
      note: 'pago fora',
    });

    const result = await accrueCashback(
      {
        bookings: s.bookings,
        payments: s.payments,
        schedule: s.schedule,
        cashback: s.cashback,
      },
      ctx,
      { bookingId: s.booking.id },
    );

    // 10% de R$ 1.800,00 — e não de R$ 2.000,00.
    expect(result.amountCents).toBe(180_00);
  });
});

describe('CP-08: cancelar a inscrição devolve o uso do cupom', () => {
  it('o resgate é liberado junto do cancelamento', async () => {
    const s = await setup();
    await applyCouponToBooking(s.applyDeps, ctx, {
      bookingId: s.booking.id,
      code: 'VERAO10',
    });

    await cancelBooking({ bookings: s.bookings, coupons: s.coupons, clock: () => NOW }, ctx, {
      bookingId: s.booking.id,
      reason: 'família desistiu',
    });

    expect(await s.coupons.findActiveByBooking(ctx.tenantId, s.booking.id)).toBeNull();
    const coupon = (await s.coupons.list(ctx.tenantId))[0]!;
    const uses = await s.coupons.countUses(ctx.tenantId, coupon.id, s.responsible.id);
    expect(uses.total).toBe(0);
  });
});
