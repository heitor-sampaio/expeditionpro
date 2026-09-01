import { cents, type Cents } from '../money/cents.js';
import { compareLocalDate, type LocalDate } from '../date/localDate.js';

/**
 * CB-07/CB-08 — saldo **disponível** de cashback numa data, derivado do ledger. Distinto do
 * saldo cru (SUM de tudo): não conta crédito ainda não liberado (`availableFrom` futuro) nem
 * crédito vencido (`expiresAt` já chegou). O resgate reduz o crédito da própria inscrição —
 * netamos por `bookingId`, e o disponível de uma inscrição nunca fica negativo (resgate a
 * mais não vira dívida de outra). Entradas sem inscrição (ajuste avulso) entram direto.
 *
 * Função pura: a data de referência é parâmetro, nunca `new Date()`.
 */

export interface CashbackLedgerEntry {
  readonly bookingId: string | null;
  readonly type: string; // accrual | redemption | expiry | adjustment
  readonly amountCents: Cents; // com sinal
  readonly availableFrom: LocalDate | null;
  readonly expiresAt: LocalDate | null;
}

export function availableCashback(
  entries: readonly CashbackLedgerEntry[],
  today: LocalDate,
): Cents {
  const perBooking = new Map<string, CashbackLedgerEntry[]>();
  let loose = 0;

  for (const entry of entries) {
    if (entry.bookingId === null) {
      loose += entry.amountCents;
      continue;
    }
    const group = perBooking.get(entry.bookingId) ?? [];
    group.push(entry);
    perBooking.set(entry.bookingId, group);
  }

  let total = loose;
  for (const group of perBooking.values()) {
    const accrual = group.find((entry) => entry.type === 'accrual');
    if (accrual && !isCountable(accrual, today)) continue; // futuro ou vencido → não conta
    const net = group.reduce((sum, entry) => sum + entry.amountCents, 0);
    total += Math.max(0, net);
  }

  return cents(Math.max(0, total));
}

/** Conta se já foi liberado (availableFrom no passado/hoje) e ainda não venceu. */
function isCountable(accrual: CashbackLedgerEntry, today: LocalDate): boolean {
  const released =
    accrual.availableFrom === null || compareLocalDate(accrual.availableFrom, today) <= 0;
  const notExpired = accrual.expiresAt === null || compareLocalDate(accrual.expiresAt, today) > 0;
  return released && notExpired;
}
