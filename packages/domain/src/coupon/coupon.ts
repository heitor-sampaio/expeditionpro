import { applyPercentFloor, cents, type Cents } from '../money/cents.js';
import { compareLocalDate, type LocalDate } from '../date/localDate.js';

/**
 * Núcleo puro do cupom de desconto (§5.15). Decide se um cupom vale para uma inscrição
 * e quanto ele abate — nada mais. Contar usos, gravar resgate e cobrar papel é da
 * camada de aplicação; a data de hoje entra por parâmetro, nunca de `new Date()`.
 */

export type CouponMode = 'percent' | 'fixed';

export class InvalidCouponCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCouponCodeError';
  }
}

/** O cupom como o domínio o enxerga — sem id, sem tenant, sem trilha. */
export interface Coupon {
  readonly code: string;
  readonly mode: CouponMode;
  /** Percentual (ex.: 10) ou centavos, conforme `mode`. */
  readonly value: number;
  readonly active: boolean;
  readonly validFrom: LocalDate | null;
  readonly validUntil: LocalDate | null;
  readonly maxUses: number | null;
  readonly maxUsesPerCustomer: number | null;
  /** Escopo (CP-02) e destinatário (CP-03). `null` = sem restrição. */
  readonly itineraryId: string | null;
  readonly groupId: string | null;
  readonly customerId: string | null;
}

/** O que se sabe da inscrição no momento de aplicar, já com os usos contados. */
export interface CouponUsageContext {
  readonly today: LocalDate;
  readonly itineraryId: string;
  readonly groupId: string;
  readonly responsibleCustomerId: string;
  readonly usesTotal: number;
  readonly usesByCustomer: number;
}

/** Motivo tipado — erro de negócio é tipo, não string solta. */
export type CouponRejection =
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'itinerary_not_allowed'
  | 'group_not_allowed'
  | 'not_for_this_customer'
  | 'exhausted'
  | 'customer_limit_reached';

export type CouponCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: CouponRejection };

const CODE_PATTERN = /^[A-Z0-9-]{3,24}$/;

/**
 * CP-01 — o código como ele é guardado e comparado: caixa alta, sem espaço, só A-Z,
 * dígito e hífen. Cupom se dita por telefone e se digita no celular; acento e espaço
 * transformam isso em suporte.
 */
export function normalizeCouponCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    throw new InvalidCouponCodeError(
      'Código deve ter de 3 a 24 caracteres, apenas letras, números e hífen',
    );
  }
  return code;
}

/** CP-01/CP-02/CP-03/CP-04 — o cupom vale para esta inscrição, hoje? */
export function checkCoupon(coupon: Coupon, context: CouponUsageContext): CouponCheck {
  if (!coupon.active) return reject('inactive');

  if (coupon.validFrom !== null && compareLocalDate(context.today, coupon.validFrom) < 0) {
    return reject('not_started');
  }
  if (coupon.validUntil !== null && compareLocalDate(context.today, coupon.validUntil) > 0) {
    return reject('expired');
  }

  if (coupon.itineraryId !== null && coupon.itineraryId !== context.itineraryId) {
    return reject('itinerary_not_allowed');
  }
  if (coupon.groupId !== null && coupon.groupId !== context.groupId) {
    return reject('group_not_allowed');
  }
  if (coupon.customerId !== null && coupon.customerId !== context.responsibleCustomerId) {
    return reject('not_for_this_customer');
  }

  if (coupon.maxUses !== null && context.usesTotal >= coupon.maxUses) {
    return reject('exhausted');
  }
  if (coupon.maxUsesPerCustomer !== null && context.usesByCustomer >= coupon.maxUsesPerCustomer) {
    return reject('customer_limit_reached');
  }

  return { ok: true };
}

/**
 * CP-01 — quanto o cupom abate de um subtotal. Percentual trunca para baixo; o abatimento
 * nunca passa do próprio subtotal, porque desconto que excede a venda viraria crédito a
 * devolver, e crédito neste sistema só nasce de cashback (§5.8) ou devolução (§3.6).
 */
export function calculateCouponDiscount(
  subtotal: Cents,
  coupon: Pick<Coupon, 'mode' | 'value'>,
): Cents {
  const ceiling = Math.max(0, subtotal);
  const raw =
    coupon.mode === 'fixed'
      ? Math.max(0, Math.trunc(coupon.value))
      : applyPercentFloor(cents(ceiling), Math.max(0, coupon.value));
  return cents(Math.min(ceiling, raw));
}

function reject(reason: CouponRejection): CouponCheck {
  return { ok: false, reason };
}
