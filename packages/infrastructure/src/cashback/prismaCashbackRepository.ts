import type {
  CashbackEntryRecord,
  CashbackRepository,
  ExpiredCredit,
  NewCashbackEntry,
} from '@expedition/application';
import {
  cents,
  type CashbackConfig,
  type CashbackOverride,
  type Cents,
  type LocalDate,
} from '@expedition/domain';
import type { CashbackEntry as PrismaEntry, Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma do cashback (§5.8). Ledger append-only; saldo é SUM(amount_cents).
 * `Cents` (com sinal) ↔ BigInt; datas `@db.Date`. A config vive em `tenant.settings.cashback`
 * e o override em `groups.cashback_override` — lidos com defaults zerados/desligados.
 */
export function prismaCashbackRepository(base: PrismaClient): CashbackRepository {
  return {
    async addEntry(entry: NewCashbackEntry): Promise<CashbackEntryRecord> {
      const row = await tenantClient(base, entry.tenantId).cashbackEntry.create({
        data: {
          tenantId: entry.tenantId,
          customerId: entry.customerId,
          bookingId: entry.bookingId,
          type: entry.type,
          amountCents: BigInt(entry.amountCents),
          availableFrom: entry.availableFrom ? localDateToDate(entry.availableFrom) : null,
          expiresAt: entry.expiresAt ? localDateToDate(entry.expiresAt) : null,
          notes: entry.notes,
          createdBy: entry.createdBy,
        },
      });
      return toRecord(row);
    },

    async listByCustomer(tenantId: string, customerId: string): Promise<CashbackEntryRecord[]> {
      const rows = await tenantClient(base, tenantId).cashbackEntry.findMany({
        where: { customerId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toRecord);
    },

    async balance(tenantId: string, customerId: string): Promise<Cents> {
      const agg = await tenantClient(base, tenantId).cashbackEntry.aggregate({
        where: { customerId },
        _sum: { amountCents: true },
      });
      return cents(Number(agg._sum.amountCents ?? 0n));
    },

    async hasAccrual(tenantId: string, bookingId: string): Promise<boolean> {
      const found = await tenantClient(base, tenantId).cashbackEntry.findFirst({
        where: { bookingId, type: 'accrual' },
        select: { id: true },
      });
      return found !== null;
    },

    async getConfig(tenantId: string): Promise<CashbackConfig> {
      const tenant = await base.tenant.findUnique({ where: { id: tenantId } });
      const settings = (tenant?.settings ?? {}) as { cashback?: Partial<CashbackConfig> };
      return withDefaults(settings.cashback);
    },

    async saveConfig(tenantId: string, config: CashbackConfig): Promise<void> {
      const tenant = await base.tenant.findUnique({ where: { id: tenantId } });
      const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
      const next = { ...settings, cashback: config } as unknown as Prisma.InputJsonObject;
      await base.tenant.update({ where: { id: tenantId }, data: { settings: next } });
    },

    async getGroupOverride(tenantId: string, groupId: string): Promise<CashbackOverride> {
      const group = await tenantClient(base, tenantId).group.findUnique({ where: { id: groupId } });
      const raw = group?.cashbackOverride as CashbackOverride | null | undefined;
      if (!raw || raw.kind === undefined) return { kind: 'inherit' };
      return raw;
    },

    async listExpiredCredits(tenantId: string, asOf: LocalDate): Promise<ExpiredCredit[]> {
      const db = tenantClient(base, tenantId);
      // Accruals cujo prazo já chegou — a inscrição (bookingId) e o responsável (customerId).
      const expiredAccruals = await db.cashbackEntry.findMany({
        where: { type: 'accrual', expiresAt: { lte: localDateToDate(asOf) } },
        select: { bookingId: true, customerId: true },
      });
      const customerByBooking = new Map<string, string>();
      for (const a of expiredAccruals) {
        if (a.bookingId) customerByBooking.set(a.bookingId, a.customerId);
      }
      if (customerByBooking.size === 0) return [];

      // Saldo remanescente por inscrição (accrual − resgates − expiração já lançada).
      const sums = await db.cashbackEntry.groupBy({
        by: ['bookingId'],
        where: { bookingId: { in: [...customerByBooking.keys()] } },
        _sum: { amountCents: true },
      });
      const expired: ExpiredCredit[] = [];
      for (const row of sums) {
        const net = Number(row._sum.amountCents ?? 0n);
        if (row.bookingId && net > 0) {
          expired.push({
            customerId: customerByBooking.get(row.bookingId)!,
            bookingId: row.bookingId,
            remainingCents: cents(net),
          });
        }
      }
      return expired;
    },
  };
}

function withDefaults(cashback: Partial<CashbackConfig> | undefined): CashbackConfig {
  return {
    enabled: cashback?.enabled ?? false,
    mode: cashback?.mode ?? 'percent',
    value: cashback?.value ?? 0,
    base: cashback?.base ?? 'paid',
    releaseDays: cashback?.releaseDays ?? 0,
    validityMonths: cashback?.validityMonths ?? 0,
    maxRedemptionPct: cashback?.maxRedemptionPct ?? 0,
  };
}

function toRecord(row: PrismaEntry): CashbackEntryRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    bookingId: row.bookingId,
    type: row.type,
    amountCents: cents(Number(row.amountCents)),
    availableFrom: row.availableFrom ? dateToLocalDate(row.availableFrom) : null,
    expiresAt: row.expiresAt ? dateToLocalDate(row.expiresAt) : null,
    notes: row.notes,
  };
}

function localDateToDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function dateToLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
