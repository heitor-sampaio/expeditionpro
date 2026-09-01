import {
  cents,
  compareLocalDate,
  sumCents,
  type CashbackConfig,
  type CashbackOverride,
  type LocalDate,
} from '@expedition/domain';
import type {
  CashbackEntryRecord,
  CashbackRepository,
  NewCashbackEntry,
} from '@expedition/application';

const DISABLED: CashbackConfig = {
  enabled: false,
  mode: 'percent',
  value: 0,
  base: 'paid',
  releaseDays: 0,
  validityMonths: 0,
  maxRedemptionPct: 0,
};

/** Cashback em memória — SÓ para dev sem banco e testes de rota. */
export function inMemoryCashback(seed?: {
  config?: CashbackConfig;
  override?: CashbackOverride;
}): CashbackRepository {
  const rows: (CashbackEntryRecord & { tenantId: string })[] = [];
  let seq = 0;
  let config = seed?.config ?? DISABLED;
  const override = seed?.override ?? { kind: 'inherit' as const };

  return {
    addEntry(entry: NewCashbackEntry) {
      seq += 1;
      const record = {
        id: `dev-cb-${seq}`,
        tenantId: entry.tenantId,
        customerId: entry.customerId,
        bookingId: entry.bookingId,
        type: entry.type,
        amountCents: entry.amountCents,
        availableFrom: entry.availableFrom,
        expiresAt: entry.expiresAt,
        notes: entry.notes,
      };
      rows.push(record);
      return Promise.resolve(record);
    },
    listByCustomer(tenantId: string, customerId: string) {
      return Promise.resolve(
        rows.filter((r) => r.tenantId === tenantId && r.customerId === customerId),
      );
    },
    balance(tenantId: string, customerId: string) {
      return Promise.resolve(
        sumCents(
          rows
            .filter((r) => r.tenantId === tenantId && r.customerId === customerId)
            .map((r) => r.amountCents),
        ),
      );
    },
    hasAccrual(tenantId: string, bookingId: string) {
      return Promise.resolve(
        rows.some(
          (r) => r.tenantId === tenantId && r.bookingId === bookingId && r.type === 'accrual',
        ),
      );
    },
    getConfig() {
      return Promise.resolve(config);
    },
    saveConfig(_tenantId: string, next: CashbackConfig) {
      config = next;
      return Promise.resolve();
    },
    getGroupOverride() {
      return Promise.resolve(override);
    },
    listExpiredCredits(tenantId: string, asOf: LocalDate) {
      const byBooking = new Map<string, typeof rows>();
      for (const r of rows) {
        if (r.tenantId !== tenantId || r.bookingId === null) continue;
        const group = byBooking.get(r.bookingId) ?? [];
        group.push(r);
        byBooking.set(r.bookingId, group);
      }
      const expired = [];
      for (const [bookingId, group] of byBooking) {
        const accrual = group.find((r) => r.type === 'accrual');
        if (!accrual?.expiresAt || compareLocalDate(accrual.expiresAt, asOf) > 0) continue;
        const net = sumCents(group.map((r) => r.amountCents));
        if (net > 0) {
          expired.push({ customerId: accrual.customerId, bookingId, remainingCents: cents(net) });
        }
      }
      return Promise.resolve(expired);
    },
  };
}
