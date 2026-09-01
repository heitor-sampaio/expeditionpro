import { describe, expect, it } from 'vitest';
import { cents, parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakeCashbackRepository } from '../cashback/cashbackRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeCouponRepository } from './couponRepository.fake.js';
import { allocateBooking } from '../bookings/allocateBooking.js';
import { applyCouponToBooking, type ApplyCouponToBookingDeps } from './applyCouponToBooking.js';
import { removeCouponFromBooking } from './removeCouponFromBooking.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import type { RequestContext } from '../context.js';
import type { NewCoupon } from './couponRepository.js';

/**
 * CP-05..CP-08 — aplicar um cupom a uma inscrição. O desconto entra como resgate; o
 * snapshot do participante permanece exatamente como a alocação o congelou (§3.4).
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const NOW = new Date('2026-08-30T12:00:00.000Z');
const CPFS = ['90000010057', '11144477735', '52998224725'];

const PRICES = {
  validFrom: parseLocalDate('2025-01-01'),
  prices: {
    coupleCents: cents(2_000_00),
    soloCents: cents(1_200_00),
    extraAdultCents: cents(800_00),
    childMidCents: cents(600_00),
    childYoungCents: cents(400_00),
  },
};

async function setup() {
  const customers = fakeCustomerRepository();
  const itineraries = fakeItineraryRepository();
  const schedule = fakeScheduleRepository();
  const bookings = fakeBookingRepository();
  const cashback = fakeCashbackRepository();
  const payments = fakePaymentRepository(bookings.rows);
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
    PRICES,
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
    cpf: parseCpf(CPFS[0]!),
    birthDate: parseLocalDate('1985-03-02'),
    email: 'heitor@example.com',
    phone: '+5548999999999',
    address: EMPTY_ADDRESS,
  });

  // Casal: R$ 2.000,00 congelados na alocação.
  const spouse = await customers.create({
    tenantId: ctx.tenantId,
    responsibleId: responsible.id,
    fullName: 'Vanessa Sampaio',
    cpf: parseCpf(CPFS[1]!),
    birthDate: parseLocalDate('1987-07-19'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });

  const { booking } = await allocateBooking(
    { bookings, schedule, itineraries, customers, cashback },
    ctx,
    {
      groupId: group.id,
      responsibleCustomerId: responsible.id,
      participantCustomerIds: [responsible.id, spouse.id],
      source: 'manual',
    },
  );

  const deps: ApplyCouponToBookingDeps = {
    coupons,
    bookings,
    schedule,
    payments,
    audit,
    clock: () => NOW,
  };

  return { deps, coupons, bookings, payments, audit, booking, group, itinerary, responsible };
}

function couponInput(overrides: Partial<NewCoupon> = {}): NewCoupon {
  return {
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
    ...overrides,
  };
}

describe('CP-05: o cupom abate o contratado sem tocar no snapshot', () => {
  it('grava o resgate com o desconto calculado sobre a soma dos unitários', async () => {
    const { deps, coupons, booking } = await setup();
    await coupons.create(couponInput());

    const result = await applyCouponToBooking(deps, ctx, {
      bookingId: booking.id,
      code: 'verao10',
    });

    // 10% de R$ 2.000,00
    expect(result.discountCents).toBe(200_00);
    expect(result.contractedCents).toBe(1_800_00);
    expect(result.code).toBe('VERAO10');
  });

  it('os valores unitários congelados permanecem intactos', async () => {
    const { deps, coupons, bookings, booking } = await setup();
    await coupons.create(couponInput({ mode: 'fixed', value: 300_00, code: 'FIXO300' }));

    await applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'FIXO300' });

    const stored = await bookings.findById(ctx.tenantId, booking.id);
    expect(stored?.participants.map((p) => p.unitPriceCents)).toEqual([2_000_00, 0]);
    expect(stored?.participants.every((p) => p.priceSource === 'auto')).toBe(true);
  });

  it('CP-10: o resgate congela código, modo e valor da regra usada', async () => {
    const { deps, coupons, booking } = await setup();
    const coupon = await coupons.create(couponInput());

    await applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'VERAO10' });
    // O cupom muda depois — o resgate não acompanha.
    await coupons.update(ctx.tenantId, coupon.id, { value: 50 });

    const redemption = await coupons.findActiveByBooking(ctx.tenantId, booking.id);
    expect(redemption?.mode).toBe('percent');
    expect(redemption?.value).toBe(10);
    expect(redemption?.discountCents).toBe(200_00);
  });

  it('CP-06: registra a aplicação na trilha, sem o valor do desconto virar dado pessoal', async () => {
    const { deps, coupons, audit, booking } = await setup();
    await coupons.create(couponInput());

    await applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'VERAO10' });

    const entry = audit.rows.find((r) => r.action === 'coupon.apply');
    expect(entry?.entity).toBe('booking');
    expect(entry?.entityId).toBe(booking.id);
    expect(entry?.diff).toMatchObject({ code: 'VERAO10', discountCents: 200_00 });
  });
});

describe('CP-06: quem aplica e quando não dá para aplicar', () => {
  it('operator não aplica cupom', async () => {
    const { deps, coupons, booking } = await setup();
    await coupons.create(couponInput());

    await expect(
      applyCouponToBooking(
        deps,
        { ...ctx, actor: { kind: 'team', userId: 'u2', role: 'operator' } },
        { bookingId: booking.id, code: 'VERAO10' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não aplica cupom pelo portal nesta entrega', async () => {
    const { deps, coupons, booking, responsible } = await setup();
    await coupons.create(couponInput());

    await expect(
      applyCouponToBooking(
        deps,
        { ...ctx, actor: { kind: 'customer', customerId: responsible.id, userId: 'u3' } },
        { bookingId: booking.id, code: 'VERAO10' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('código inexistente não diz mais do que "não encontrado"', async () => {
    const { deps, booking } = await setup();

    await expect(
      applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'NAOEXISTE' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('uma inscrição não recebe dois cupons', async () => {
    const { deps, coupons, booking } = await setup();
    await coupons.create(couponInput());
    await coupons.create(couponInput({ code: 'OUTRO20', value: 20 }));

    await applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'VERAO10' });

    await expect(
      applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'OUTRO20' }),
    ).rejects.toMatchObject({ code: 'coupon_already_applied' });
  });

  it('inscrição cancelada não é reprecificada', async () => {
    const { deps, coupons, bookings, booking } = await setup();
    await coupons.create(couponInput());
    await bookings.cancel(ctx.tenantId, booking.id, {
      cancelledBy: 'u1',
      cancelledAt: NOW,
      reason: 'desistiu',
    });

    await expect(
      applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'VERAO10' }),
    ).rejects.toMatchObject({ code: 'booking_cancelled' });
  });
});

describe('CP-01..CP-04: o motivo da recusa chega ao chamador', () => {
  it('cupom vencido responde `expired`', async () => {
    const { deps, coupons, booking } = await setup();
    await coupons.create(couponInput({ validUntil: parseLocalDate('2026-08-29') }));

    await expect(
      applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'VERAO10' }),
    ).rejects.toMatchObject({ code: 'expired' });
  });

  it('cupom de outro roteiro responde `itinerary_not_allowed`', async () => {
    const { deps, coupons, booking } = await setup();
    await coupons.create(couponInput({ itineraryId: 'itin-outro' }));

    await expect(
      applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'VERAO10' }),
    ).rejects.toMatchObject({ code: 'itinerary_not_allowed' });
  });

  it('cupom do próprio roteiro passa', async () => {
    const { deps, coupons, booking, itinerary } = await setup();
    await coupons.create(couponInput({ itineraryId: itinerary.id }));

    const result = await applyCouponToBooking(deps, ctx, {
      bookingId: booking.id,
      code: 'VERAO10',
    });
    expect(result.discountCents).toBe(200_00);
  });

  it('CP-04: o limite total conta os resgates ativos', async () => {
    const { deps, coupons, booking } = await setup();
    await coupons.create(couponInput({ maxUses: 1 }));
    await applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'VERAO10' });
    await removeCouponFromBooking(
      { coupons, bookings: deps.bookings, audit: deps.audit, clock: deps.clock },
      ctx,
      {
        bookingId: booking.id,
      },
    );

    // Liberado, o uso voltou: dá para aplicar de novo (CP-08).
    const again = await applyCouponToBooking(deps, ctx, {
      bookingId: booking.id,
      code: 'VERAO10',
    });
    expect(again.discountCents).toBe(200_00);
  });
});

describe('CP-07: desconto não derruba o contratado abaixo do recebido', () => {
  it('recusa quando o cliente já pagou mais do que sobraria', async () => {
    const { deps, coupons, payments, booking } = await setup();
    await coupons.create(couponInput({ mode: 'fixed', value: 1_900_00, code: 'METADE' }));
    await payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: booking.id,
        paidAt: parseLocalDate('2026-08-20'),
        amountCents: cents(1_500_00),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: 'u1',
      },
      null,
    );

    await expect(
      applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'METADE' }),
    ).rejects.toMatchObject({ code: 'discount_below_received' });
  });

  it('aceita quando o contratado com desconto ainda cobre o recebido', async () => {
    const { deps, coupons, payments, booking } = await setup();
    await coupons.create(couponInput());
    await payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: booking.id,
        paidAt: parseLocalDate('2026-08-20'),
        amountCents: cents(500_00),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: 'u1',
      },
      null,
    );

    const result = await applyCouponToBooking(deps, ctx, {
      bookingId: booking.id,
      code: 'VERAO10',
    });
    expect(result.contractedCents).toBe(1_800_00);
  });
});

describe('CP-08: remover o cupom devolve o uso', () => {
  it('libera o resgate e o contratado volta ao valor cheio', async () => {
    const { deps, coupons, bookings, audit, booking } = await setup();
    await coupons.create(couponInput());
    await applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'VERAO10' });

    const result = await removeCouponFromBooking(
      { coupons, bookings, audit, clock: deps.clock },
      ctx,
      { bookingId: booking.id },
    );

    expect(result.contractedCents).toBe(2_000_00);
    expect(await coupons.findActiveByBooking(ctx.tenantId, booking.id)).toBeNull();
    expect(audit.rows.some((r) => r.action === 'coupon.remove')).toBe(true);
  });

  it('inscrição sem cupom não tem o que remover', async () => {
    const { deps, coupons, bookings, audit, booking } = await setup();

    await expect(
      removeCouponFromBooking({ coupons, bookings, audit, clock: deps.clock }, ctx, {
        bookingId: booking.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('operator não remove cupom', async () => {
    const { deps, coupons, bookings, audit, booking } = await setup();
    await coupons.create(couponInput());
    await applyCouponToBooking(deps, ctx, { bookingId: booking.id, code: 'VERAO10' });

    await expect(
      removeCouponFromBooking(
        { coupons, bookings, audit, clock: deps.clock },
        { ...ctx, actor: { kind: 'team', userId: 'u2', role: 'operator' } },
        { bookingId: booking.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('CP-05: o erro de negócio é tipo, não string solta', () => {
  it('a recusa do domínio vira BusinessRuleError com o motivo no code', async () => {
    const { deps, coupons, booking } = await setup();
    await coupons.create(couponInput({ active: false }));

    const error = await applyCouponToBooking(deps, ctx, {
      bookingId: booking.id,
      code: 'VERAO10',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as BusinessRuleError).code).toBe('inactive');
  });
});
