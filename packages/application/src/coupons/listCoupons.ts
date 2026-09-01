import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { CouponRecord, CouponRepository } from './couponRepository.js';

/**
 * CP-04 — os cupons do tenant com o uso já contado, para a tela de Promoções.
 *
 * Leitura de qualquer papel de equipe, viewer incluído: quem atende precisa saber que
 * cupom existe e se ainda tem uso, mesmo sem poder criar. O cliente não lê (§3.7).
 */

export interface ListCouponsDeps {
  readonly coupons: CouponRepository;
}

export interface CouponListItem extends CouponRecord {
  /** Resgates ativos — o que já foi usado e não foi devolvido (CP-08). */
  readonly uses: number;
}

export async function listCoupons(
  deps: ListCouponsDeps,
  ctx: RequestContext,
): Promise<CouponListItem[]> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('Cupons são gerenciados pela equipe');
  }

  const [coupons, uses] = await Promise.all([
    deps.coupons.list(ctx.tenantId),
    deps.coupons.countActiveByCoupon(ctx.tenantId),
  ]);

  return coupons.map((coupon) => ({ ...coupon, uses: uses[coupon.id] ?? 0 }));
}
