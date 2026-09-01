import type { Cents, CouponMode, LocalDate } from '@expedition/domain';

/**
 * Port de cupons (§5.15). Duas entidades: o **cupom**, que é a regra, e o **resgate**,
 * que é o cupom aplicado a uma inscrição.
 *
 * O uso de um cupom nunca é coluna: é a contagem dos resgates ativos (`releasedAt`
 * nulo), pelo mesmo motivo que saldo é `SUM()` do ledger (§3.6) — contador mantido à
 * mão diverge, e aqui divergir significa deixar passar do limite ou barrar quem podia.
 */

export interface CouponRecord {
  readonly id: string;
  readonly code: string;
  readonly description: string | null;
  readonly mode: CouponMode;
  /** Percentual inteiro (ex.: 10) ou centavos, conforme `mode`. */
  readonly value: number;
  readonly active: boolean;
  readonly validFrom: LocalDate | null;
  readonly validUntil: LocalDate | null;
  readonly maxUses: number | null;
  readonly maxUsesPerCustomer: number | null;
  readonly itineraryId: string | null;
  readonly groupId: string | null;
  readonly customerId: string | null;
  readonly createdAt: Date;
}

export interface NewCoupon {
  readonly tenantId: string;
  readonly code: string;
  readonly description: string | null;
  readonly mode: CouponMode;
  readonly value: number;
  readonly active: boolean;
  readonly validFrom: LocalDate | null;
  readonly validUntil: LocalDate | null;
  readonly maxUses: number | null;
  readonly maxUsesPerCustomer: number | null;
  readonly itineraryId: string | null;
  readonly groupId: string | null;
  readonly customerId: string | null;
  readonly createdBy: string | null;
}

/** Campo ausente preserva o valor atual; `null` explícito limpa a restrição. */
export interface CouponPatch {
  readonly description?: string | null;
  readonly mode?: CouponMode;
  readonly value?: number;
  readonly active?: boolean;
  readonly validFrom?: LocalDate | null;
  readonly validUntil?: LocalDate | null;
  readonly maxUses?: number | null;
  readonly maxUsesPerCustomer?: number | null;
  readonly itineraryId?: string | null;
  readonly groupId?: string | null;
  readonly customerId?: string | null;
}

/** CP-10: o resgate carrega a regra congelada — o cupom pode mudar depois. */
export interface RedemptionRecord {
  readonly id: string;
  readonly couponId: string;
  readonly bookingId: string;
  readonly customerId: string;
  readonly code: string;
  readonly mode: CouponMode;
  readonly value: number;
  readonly discountCents: Cents;
  readonly redeemedAt: Date;
  readonly releasedAt: Date | null;
}

export interface NewRedemption {
  readonly tenantId: string;
  readonly couponId: string;
  readonly bookingId: string;
  readonly customerId: string;
  readonly code: string;
  readonly mode: CouponMode;
  readonly value: number;
  readonly discountCents: Cents;
  readonly redeemedBy: string | null;
}

/** CP-04: usos ativos do cupom — no tenant e do cliente em questão. */
export interface CouponUses {
  readonly total: number;
  readonly byCustomer: number;
}

export interface CouponRepository {
  create(coupon: NewCoupon): Promise<CouponRecord>;
  update(tenantId: string, couponId: string, patch: CouponPatch): Promise<CouponRecord>;
  /** Exclusão lógica: o cupom já resgatado continua existindo para o histórico. */
  softDelete(tenantId: string, couponId: string): Promise<void>;
  findById(tenantId: string, couponId: string): Promise<CouponRecord | null>;
  /** O código já chega normalizado (caixa alta) por quem chama. */
  findByCode(tenantId: string, code: string): Promise<CouponRecord | null>;
  list(tenantId: string): Promise<CouponRecord[]>;
  countUses(tenantId: string, couponId: string, customerId: string): Promise<CouponUses>;
  /** Usos ativos de todos os cupons do tenant, para a listagem (`couponId` → usos). */
  countActiveByCoupon(tenantId: string): Promise<Record<string, number>>;
  findActiveByBooking(tenantId: string, bookingId: string): Promise<RedemptionRecord | null>;
  redeem(redemption: NewRedemption): Promise<RedemptionRecord>;
  /** CP-08: devolve o uso ao cupom. Idempotente: sem resgate ativo, não faz nada. */
  release(
    tenantId: string,
    bookingId: string,
    releasedBy: string | null,
    releasedAt: Date,
  ): Promise<void>;
}
