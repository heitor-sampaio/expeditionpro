import { normalizeCouponCode, type CouponMode } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import { assertValidCouponSettings, optionalDate } from './couponValidation.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CouponRecord, CouponRepository } from './couponRepository.js';

/**
 * CP-01..CP-04 — cria um cupom. Escopo, validade e limites são todos opcionais: o
 * cupom mais simples é código + desconto, e vale para qualquer inscrição do tenant.
 *
 * Criar desconto move dinheiro, então exige owner ou admin (CP-06).
 */

export interface CreateCouponDeps {
  readonly coupons: CouponRepository;
  readonly audit: AuditLogRepository;
}

export interface CreateCouponCommand {
  readonly code: string;
  readonly mode: CouponMode;
  readonly value: number;
  readonly description?: string | null | undefined;
  readonly validFrom?: string | null | undefined;
  readonly validUntil?: string | null | undefined;
  readonly maxUses?: number | null | undefined;
  readonly maxUsesPerCustomer?: number | null | undefined;
  readonly itineraryId?: string | null | undefined;
  readonly groupId?: string | null | undefined;
  readonly customerId?: string | null | undefined;
}

export async function createCoupon(
  deps: CreateCouponDeps,
  ctx: RequestContext,
  command: CreateCouponCommand,
): Promise<CouponRecord> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Criar cupom exige owner ou admin');
  }

  const code = parseCode(command.code);
  const settings = {
    mode: command.mode,
    value: command.value,
    validFrom: optionalDate(command.validFrom),
    validUntil: optionalDate(command.validUntil),
    maxUses: command.maxUses ?? null,
    maxUsesPerCustomer: command.maxUsesPerCustomer ?? null,
    itineraryId: command.itineraryId ?? null,
    groupId: command.groupId ?? null,
  };
  assertValidCouponSettings(settings);

  const existing = await deps.coupons.findByCode(ctx.tenantId, code);
  if (existing) {
    throw new BusinessRuleError('code_taken', 'Já existe um cupom com esse código');
  }

  const coupon = await deps.coupons.create({
    tenantId: ctx.tenantId,
    code,
    description: blankToNull(command.description),
    customerId: command.customerId ?? null,
    active: true,
    createdBy: actorUserId(actor),
    ...settings,
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'coupon',
    entityId: coupon.id,
    action: 'coupon.create',
    diff: { code: coupon.code, mode: coupon.mode, value: coupon.value },
  });

  return coupon;
}

/** O erro de formato do domínio vira erro de negócio com código estável para a borda. */
export function parseCode(raw: string): string {
  try {
    return normalizeCouponCode(raw);
  } catch {
    throw new BusinessRuleError(
      'invalid_code',
      'O código deve ter de 3 a 24 caracteres, apenas letras, números e hífen',
    );
  }
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
