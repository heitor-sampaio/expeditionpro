import { describe, expect, it } from 'vitest';
import { cents, parseLocalDate, type CashbackConfig, type PriceCategory } from '@expedition/domain';
import { fakeBookingRepository } from '../bookings/bookingRepository.fake.js';
import { fakePaymentRepository } from '../payments/paymentRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { fakeCashbackRepository } from './cashbackRepository.fake.js';
import { accrueCashback } from './accrueCashback.js';
import { redeemCashback } from './redeemCashback.js';
import { getCashbackStatement } from './getCashbackStatement.js';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRecord, CashbackSnapshot } from '../bookings/bookingRepository.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

const CONFIG: CashbackConfig = {
  enabled: true,
  mode: 'percent',
  value: 5,
  base: 'paid',
  releaseDays: 30,
  validityMonths: 12,
  maxRedemptionPct: 50,
};

async function seed(opts: {
  status?: string;
  config?: CashbackConfig;
  override?: Parameters<typeof fakeCashbackRepository>[0] extends undefined
    ? never
    : NonNullable<Parameters<typeof fakeCashbackRepository>[0]>['override'];
  paidCents?: number;
  contractedCents?: number;
  snapshot?: CashbackSnapshot | null;
}) {
  const bookings = fakeBookingRepository();
  const payments = fakePaymentRepository(bookings.rows);
  const schedule = fakeScheduleRepository();
  const cashback = fakeCashbackRepository({
    config: opts.config ?? CONFIG,
    override: opts.override ?? { kind: 'inherit' },
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
      name: 'g',
      status: 'open',
      capacityVehicles: null,
      visibility: 'public',
      pricingMode: 'itinerary',
    },
  );

  const booking: BookingRecord = {
    id: 'bk-1',
    groupId: group.id,
    responsibleCustomerId: 'resp',
    status: opts.status ?? 'confirmed',
    source: 'manual',
    invoiceChecked: false,
    checkedInAt: null,
    ...(opts.snapshot === undefined ? {} : { cashbackRuleSnapshot: opts.snapshot }),
    participants: [
      {
        id: 'p1',
        customerId: 'resp',
        priceCategory: 'SOLO' as PriceCategory,
        unitPriceCents: cents(opts.contractedCents ?? 200000),
        priceSource: 'auto',
        priceNote: null,
      },
    ],
  };
  bookings.rows.push(booking);
  if (opts.paidCents) {
    await payments.create(
      {
        tenantId: ctx.tenantId,
        bookingId: 'bk-1',
        paidAt: parseLocalDate('2025-11-01'),
        amountCents: cents(opts.paidCents),
        method: 'pix',
        reference: null,
        notes: null,
        createdBy: null,
      },
      null,
    );
  }
  return { bookings, payments, schedule, cashback };
}

describe('CB-09: a regra congelada na inscrição manda no accrual', () => {
  it('usa o snapshot da inscrição, ignorando a config vigente da empresa', async () => {
    const deps = await seed({
      paidCents: 200000,
      config: { ...CONFIG, value: 10 }, // empresa mudou para 10% depois da alocação
      snapshot: {
        rule: {
          mode: 'percent',
          value: 5,
          base: 'paid',
          releaseDays: 30,
          validityMonths: 12,
          maxRedemptionPct: 50,
        },
      },
    });
    const result = await accrueCashback(deps, ctx, { bookingId: 'bk-1' });
    expect(result.amountCents).toBe(10000); // 5% de 200000 (congelado), não 10%
  });

  it('snapshot `{ rule: null }` = sem cashback, mesmo com a empresa ligada', async () => {
    const deps = await seed({
      paidCents: 200000,
      config: { ...CONFIG, enabled: true, value: 10 },
      snapshot: { rule: null },
    });
    const result = await accrueCashback(deps, ctx, { bookingId: 'bk-1' });
    expect(result.credited).toBe(false);
  });
});

describe('CB-03/CB-04: accrueCashback', () => {
  it('libera 5% do valor pago ao responsável, com available_from = término + 30d', async () => {
    const deps = await seed({ paidCents: 200000 });
    const result = await accrueCashback(deps, ctx, { bookingId: 'bk-1' });
    expect(result.credited).toBe(true);
    expect(result.amountCents).toBe(10000); // 5% de 200000
    const entry = deps.cashback.rows[0]!;
    expect(entry.customerId).toBe('resp');
    expect(entry.type).toBe('accrual');
    expect(entry.availableFrom).toEqual(parseLocalDate('2025-12-14')); // 14/11 + 30d
    expect(entry.expiresAt).toEqual(parseLocalDate('2026-12-14')); // + 12 meses
  });

  it('base contracted usa o valor da inscrição', async () => {
    const deps = await seed({
      config: { ...CONFIG, base: 'contracted' },
      paidCents: 50000,
      contractedCents: 200000,
    });
    const result = await accrueCashback(deps, ctx, { bookingId: 'bk-1' });
    expect(result.amountCents).toBe(10000); // 5% de 200000 (contratado), não do pago
  });

  it('CB-04: inscrição cancelada não gera crédito', async () => {
    const deps = await seed({ status: 'cancelled', paidCents: 200000 });
    await expect(accrueCashback(deps, ctx, { bookingId: 'bk-1' })).rejects.toMatchObject({
      code: 'booking_not_confirmed',
    });
  });

  it('override off não gera crédito (credited false)', async () => {
    const deps = await seed({ override: { kind: 'off' }, paidCents: 200000 });
    const result = await accrueCashback(deps, ctx, { bookingId: 'bk-1' });
    expect(result.credited).toBe(false);
    expect(deps.cashback.rows).toHaveLength(0);
  });

  it('idempotente: não libera duas vezes', async () => {
    const deps = await seed({ paidCents: 200000 });
    await accrueCashback(deps, ctx, { bookingId: 'bk-1' });
    await expect(accrueCashback(deps, ctx, { bookingId: 'bk-1' })).rejects.toMatchObject({
      code: 'already_accrued',
    });
  });
});

describe('CB-05/CB-06: redeemCashback', () => {
  it('resgate é lançamento negativo e abate o saldo', async () => {
    const deps = await seed({ paidCents: 200000 });
    await accrueCashback(deps, ctx, { bookingId: 'bk-1' }); // saldo 10000
    const result = await redeemCashback(deps, ctx, { bookingId: 'bk-1', amountCents: 4000 });
    expect(result.amountCents).toBe(-4000);
    expect(result.newBalanceCents).toBe(6000);
  });

  it('recusa resgate acima do saldo', async () => {
    const deps = await seed({ paidCents: 200000 });
    await accrueCashback(deps, ctx, { bookingId: 'bk-1' });
    await expect(
      redeemCashback(deps, ctx, { bookingId: 'bk-1', amountCents: 20000 }),
    ).rejects.toMatchObject({ code: 'insufficient_balance' });
  });

  it('CB-06: recusa resgate acima do teto por inscrição', async () => {
    // teto 50% de 100 (contratado) = 50; saldo alto via fixo
    const deps = await seed({
      config: { ...CONFIG, mode: 'fixed', value: 100000, maxRedemptionPct: 50 },
      contractedCents: 100,
      paidCents: 1,
    });
    await accrueCashback(deps, ctx, { bookingId: 'bk-1' }); // credita 100000 fixo
    await expect(
      redeemCashback(deps, ctx, { bookingId: 'bk-1', amountCents: 60 }),
    ).rejects.toMatchObject({ code: 'exceeds_max_redemption' });
  });

  it('operator não resgata (403)', async () => {
    const deps = await seed({ paidCents: 200000 });
    await accrueCashback(deps, ctx, { bookingId: 'bk-1' });
    await expect(
      redeemCashback(
        deps,
        { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u2', role: 'operator' } },
        {
          bookingId: 'bk-1',
          amountCents: 1000,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('CB-08: getCashbackStatement', () => {
  it('extrato + saldo derivado (accrual − redemption)', async () => {
    const deps = await seed({ paidCents: 200000 });
    await accrueCashback(deps, ctx, { bookingId: 'bk-1' });
    await redeemCashback(deps, ctx, { bookingId: 'bk-1', amountCents: 4000 });
    const stmt = await getCashbackStatement(deps, ctx, { customerId: 'resp' });
    expect(stmt.balanceCents).toBe(6000);
    expect(stmt.entries).toHaveLength(2);
  });

  it('cliente não lê o extrato de outra pessoa (403)', async () => {
    const deps = await seed({ paidCents: 200000 });
    await expect(
      getCashbackStatement(
        deps,
        { tenantId: 'tenant-a', actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } },
        { customerId: 'resp' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('PC-05: o cliente lê o próprio extrato pelo portal', async () => {
    const deps = await seed({ paidCents: 200000 });
    await accrueCashback(deps, ctx, { bookingId: 'bk-1' });
    const stmt = await getCashbackStatement(
      deps,
      { tenantId: 'tenant-a', actor: { kind: 'customer', customerId: 'resp', userId: 'u9' } },
      { customerId: 'resp' },
    );
    expect(stmt.balanceCents).toBe(10000);
  });
});
