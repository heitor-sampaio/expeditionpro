import type { CashbackConfig, CashbackOverride, Cents, LocalDate } from '@expedition/domain';

/**
 * Port de cashback (§5.8). O ledger é append-only e o saldo é SUM(amount_cents), nunca
 * coluna. O port também resolve a config da empresa e o override do grupo — a decisão da
 * regra é do domínio (`resolveCashbackRule`), estes só leem o que está guardado.
 */

export interface NewCashbackEntry {
  readonly tenantId: string;
  readonly customerId: string;
  readonly bookingId: string | null;
  readonly type: string; // accrual|redemption|expiry|adjustment
  readonly amountCents: Cents; // com sinal: accrual +, redemption/expiry -
  readonly availableFrom: LocalDate | null;
  readonly expiresAt: LocalDate | null;
  readonly notes: string | null;
  readonly createdBy: string | null;
}

export interface CashbackEntryRecord {
  readonly id: string;
  readonly customerId: string;
  readonly bookingId: string | null;
  readonly type: string;
  readonly amountCents: Cents;
  readonly availableFrom: LocalDate | null;
  readonly expiresAt: LocalDate | null;
  readonly notes: string | null;
}

export interface CashbackRepository {
  addEntry(entry: NewCashbackEntry): Promise<CashbackEntryRecord>;
  listByCustomer(tenantId: string, customerId: string): Promise<CashbackEntryRecord[]>;
  /** CB-08: saldo derivado (SUM). */
  balance(tenantId: string, customerId: string): Promise<Cents>;
  /** CB-04 idempotência: já existe accrual desta inscrição? */
  hasAccrual(tenantId: string, bookingId: string): Promise<boolean>;
  /** Config de cashback da empresa (tenant.settings). */
  getConfig(tenantId: string): Promise<CashbackConfig>;
  /** CB-01/CB-02: grava a config de cashback da empresa (tenant.settings.cashback). */
  saveConfig(tenantId: string, config: CashbackConfig): Promise<void>;
  /** Override de cashback do grupo (groups.cashback_override). */
  getGroupOverride(tenantId: string, groupId: string): Promise<CashbackOverride>;
  /**
   * CB-07: crédito vencido a expirar em `asOf` — por inscrição, o saldo remanescente
   * (accrual − resgates − expiração já lançada) ainda positivo de um accrual cujo
   * `expires_at` já chegou. Base da entrada `expiry` automática.
   */
  listExpiredCredits(tenantId: string, asOf: LocalDate): Promise<ExpiredCredit[]>;
}

export interface ExpiredCredit {
  readonly customerId: string;
  readonly bookingId: string;
  readonly remainingCents: Cents;
}
