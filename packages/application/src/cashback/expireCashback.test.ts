import { describe, expect, it } from 'vitest';
import { cents, parseLocalDate } from '@expedition/domain';
import { fakeCashbackRepository } from './cashbackRepository.fake.js';
import { expireCashback } from './expireCashback.js';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

const TENANT = 'tenant-a';
const NOW = () => new Date('2026-08-26T12:00:00Z');
const team: RequestContext = {
  tenantId: TENANT,
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

async function accrual(
  cb: ReturnType<typeof fakeCashbackRepository>,
  bookingId: string,
  amount: number,
  expiresAt: string | null,
) {
  await cb.addEntry({
    tenantId: TENANT,
    customerId: 'cust-1',
    bookingId,
    type: 'accrual',
    amountCents: cents(amount),
    availableFrom: parseLocalDate('2026-01-01'),
    expiresAt: expiresAt ? parseLocalDate(expiresAt) : null,
    notes: null,
    createdBy: 'u1',
  });
}

describe('CB-07: expiração automática de cashback vencido', () => {
  it('lança uma entrada expiry do remanescente de cada crédito vencido', async () => {
    const cb = fakeCashbackRepository();
    await accrual(cb, 'b1', 10000, '2026-06-01'); // vencido
    await accrual(cb, 'b2', 5000, '2027-01-01'); // ainda válido

    const result = await expireCashback({ cashback: cb, clock: NOW }, team);

    expect(result.expiredCount).toBe(1);
    expect(result.totalExpiredCents).toBe(10000);
    // saldo cai para o crédito ainda válido
    expect(await cb.balance(TENANT, 'cust-1')).toBe(5000);
    const expiry = cb.rows.find((r) => r.type === 'expiry');
    expect(expiry!.amountCents).toBe(-10000);
    expect(expiry!.bookingId).toBe('b1');
  });

  it('expira só o remanescente: resgate já feito reduz o que expira', async () => {
    const cb = fakeCashbackRepository();
    await accrual(cb, 'b1', 10000, '2026-06-01');
    await cb.addEntry({
      tenantId: TENANT,
      customerId: 'cust-1',
      bookingId: 'b1',
      type: 'redemption',
      amountCents: cents(-4000),
      availableFrom: null,
      expiresAt: null,
      notes: null,
      createdBy: 'u1',
    });

    const result = await expireCashback({ cashback: cb, clock: NOW }, team);

    expect(result.totalExpiredCents).toBe(6000); // 10000 − 4000
    expect(await cb.balance(TENANT, 'cust-1')).toBe(0);
  });

  it('é idempotente: rodar de novo não lança nada (nada mais a expirar)', async () => {
    const cb = fakeCashbackRepository();
    await accrual(cb, 'b1', 10000, '2026-06-01');
    await expireCashback({ cashback: cb, clock: NOW }, team);
    const again = await expireCashback({ cashback: cb, clock: NOW }, team);
    expect(again.expiredCount).toBe(0);
    expect(cb.rows.filter((r) => r.type === 'expiry')).toHaveLength(1);
  });

  it('crédito totalmente resgatado não gera expiry (nada remanescente)', async () => {
    const cb = fakeCashbackRepository();
    await accrual(cb, 'b1', 10000, '2026-06-01');
    await cb.addEntry({
      tenantId: TENANT,
      customerId: 'cust-1',
      bookingId: 'b1',
      type: 'redemption',
      amountCents: cents(-10000),
      availableFrom: null,
      expiresAt: null,
      notes: null,
      createdBy: 'u1',
    });
    const result = await expireCashback({ cashback: cb, clock: NOW }, team);
    expect(result.expiredCount).toBe(0);
  });

  it('só a equipe roda a expiração', async () => {
    const cb = fakeCashbackRepository();
    const customer: RequestContext = {
      tenantId: TENANT,
      actor: { kind: 'customer', customerId: 'cust-1', userId: 'auth-1' },
    };
    await expect(expireCashback({ cashback: cb, clock: NOW }, customer)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
