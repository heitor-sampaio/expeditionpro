import { ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CouponRepository } from './couponRepository.js';

/**
 * CP-01 — tira o cupom de circulação.
 *
 * É exclusão lógica: os resgates continuam apontando para ele, porque a inscrição
 * descontada precisa responder por qual campanha pagou menos (CP-10). O que sai é a
 * lista e a possibilidade de aplicar. Desativar (`active: false`) é o caminho quando a
 * campanha só está pausada.
 */

export interface DeleteCouponDeps {
  readonly coupons: CouponRepository;
  readonly audit: AuditLogRepository;
}

export interface DeleteCouponCommand {
  readonly couponId: string;
}

export async function deleteCoupon(
  deps: DeleteCouponDeps,
  ctx: RequestContext,
  command: DeleteCouponCommand,
): Promise<void> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Excluir cupom exige owner ou admin');
  }

  const coupon = await deps.coupons.findById(ctx.tenantId, command.couponId);
  if (!coupon) throw new NotFoundError('cupom');

  await deps.coupons.softDelete(ctx.tenantId, coupon.id);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'coupon',
    entityId: coupon.id,
    action: 'coupon.delete',
    diff: { code: coupon.code },
  });
}
