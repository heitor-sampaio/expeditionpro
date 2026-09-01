import { describe, expect, it } from 'vitest';
import { cents } from '../money/cents.js';
import { parseLocalDate } from '../date/localDate.js';
import { availableCashback, type CashbackLedgerEntry } from './availableCashback.js';

const TODAY = parseLocalDate('2026-08-26');

function accrual(
  bookingId: string,
  amount: number,
  availableFrom: string | null,
  expiresAt: string | null,
): CashbackLedgerEntry {
  return {
    bookingId,
    type: 'accrual',
    amountCents: cents(amount),
    availableFrom: availableFrom ? parseLocalDate(availableFrom) : null,
    expiresAt: expiresAt ? parseLocalDate(expiresAt) : null,
  };
}

function redemption(bookingId: string, amount: number): CashbackLedgerEntry {
  return {
    bookingId,
    type: 'redemption',
    amountCents: cents(-amount),
    availableFrom: null,
    expiresAt: null,
  };
}

/**
 * CB-07/CB-08 — saldo **disponível** para resgate numa data. Diferente do saldo do ledger
 * (SUM cru): segura crédito ainda não liberado (`available_from` futuro) e não conta
 * crédito vencido (`expires_at` no passado). O resgate já feito reduz o crédito da própria
 * inscrição (neta por `bookingId`).
 */
describe('CB-07: saldo de cashback disponível por data', () => {
  it('crédito liberado e não vencido conta integralmente', () => {
    const entries = [accrual('b1', 10000, '2026-08-01', '2027-08-01')];
    expect(availableCashback(entries, TODAY)).toBe(10000);
  });

  it('crédito ainda não liberado (available_from futuro) não conta', () => {
    const entries = [accrual('b1', 10000, '2026-12-01', null)];
    expect(availableCashback(entries, TODAY)).toBe(0);
  });

  it('crédito vencido (expires_at no passado) não conta', () => {
    const entries = [accrual('b1', 10000, '2026-01-01', '2026-06-01')];
    expect(availableCashback(entries, TODAY)).toBe(0);
  });

  it('vence hoje já não conta (expira no início do dia de expires_at)', () => {
    const entries = [accrual('b1', 10000, '2026-01-01', '2026-08-26')];
    expect(availableCashback(entries, TODAY)).toBe(0);
  });

  it('resgate parcial reduz o disponível da inscrição', () => {
    const entries = [accrual('b1', 10000, '2026-08-01', null), redemption('b1', 3000)];
    expect(availableCashback(entries, TODAY)).toBe(7000);
  });

  it('resgate não deixa o disponível de uma inscrição negativo', () => {
    // (não deveria acontecer, mas o disponível por inscrição nunca vira crédito de outra)
    const entries = [accrual('b1', 10000, '2026-08-01', null), redemption('b1', 12000)];
    expect(availableCashback(entries, TODAY)).toBe(0);
  });

  it('soma inscrições: uma liberada, uma futura, uma vencida', () => {
    const entries = [
      accrual('b1', 10000, '2026-08-01', null), // conta
      accrual('b2', 5000, '2026-12-01', null), // futura, não conta
      accrual('b3', 8000, '2026-01-01', '2026-06-01'), // vencida, não conta
    ];
    expect(availableCashback(entries, TODAY)).toBe(10000);
  });

  it('ajuste sem inscrição (bookingId null) entra direto', () => {
    const entries: CashbackLedgerEntry[] = [
      accrual('b1', 10000, '2026-08-01', null),
      {
        bookingId: null,
        type: 'adjustment',
        amountCents: cents(2000),
        availableFrom: null,
        expiresAt: null,
      },
    ];
    expect(availableCashback(entries, TODAY)).toBe(12000);
  });
});
