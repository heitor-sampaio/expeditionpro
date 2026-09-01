import type { CouponMode } from '@expedition/domain';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import { assertValidCouponSettings, optionalDate } from './couponValidation.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { CouponPatch, CouponRecord, CouponRepository } from './couponRepository.js';

/**
 * CP-01 — edita um cupom: liga, desliga, muda valor, validade, escopo e limites.
 *
 * O **código não muda**: ele já circulou impresso, por mensagem e de boca. Trocar o
 * código de um cupom vivo criaria dois nomes para a mesma campanha. Quem quer outro
 * código cria outro cupom.
 *
 * Editar não mexe em resgate nenhum (CP-10): quem já usou, usou pela regra de então.
 */

export interface UpdateCouponDeps {
  readonly coupons: CouponRepository;
  readonly audit: AuditLogRepository;
}

export interface UpdateCouponCommand {
  readonly couponId: string;
  readonly mode?: CouponMode | undefined;
  readonly value?: number | undefined;
  readonly active?: boolean | undefined;
  readonly description?: string | null | undefined;
  readonly validFrom?: string | null | undefined;
  readonly validUntil?: string | null | undefined;
  readonly maxUses?: number | null | undefined;
  readonly maxUsesPerCustomer?: number | null | undefined;
  readonly itineraryId?: string | null | undefined;
  readonly groupId?: string | null | undefined;
  readonly customerId?: string | null | undefined;
}

export async function updateCoupon(
  deps: UpdateCouponDeps,
  ctx: RequestContext,
  command: UpdateCouponCommand,
): Promise<CouponRecord> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Editar cupom exige owner ou admin');
  }

  const current = await deps.coupons.findById(ctx.tenantId, command.couponId);
  if (!current) throw new NotFoundError('cupom');

  const next = {
    mode: command.mode ?? current.mode,
    value: command.value ?? current.value,
    active: command.active ?? current.active,
    description:
      command.description === undefined ? current.description : blankToNull(command.description),
    validFrom:
      command.validFrom === undefined ? current.validFrom : optionalDate(command.validFrom),
    validUntil:
      command.validUntil === undefined ? current.validUntil : optionalDate(command.validUntil),
    maxUses: command.maxUses === undefined ? current.maxUses : command.maxUses,
    maxUsesPerCustomer:
      command.maxUsesPerCustomer === undefined
        ? current.maxUsesPerCustomer
        : command.maxUsesPerCustomer,
    itineraryId: command.itineraryId === undefined ? current.itineraryId : command.itineraryId,
    groupId: command.groupId === undefined ? current.groupId : command.groupId,
    customerId: command.customerId === undefined ? current.customerId : command.customerId,
  };
  assertValidCouponSettings(next);

  const diff = changedFields(current, next);
  if (Object.keys(diff).length === 0) return current;

  const updated = await deps.coupons.update(ctx.tenantId, current.id, next as CouponPatch);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'coupon',
    entityId: current.id,
    action: 'coupon.update',
    diff,
  });

  return updated;
}

/** Os campos que a edição alcança — e, por isso, os que a trilha compara. */
const COMPARED_FIELDS = [
  'mode',
  'value',
  'active',
  'description',
  'validFrom',
  'validUntil',
  'maxUses',
  'maxUsesPerCustomer',
  'itineraryId',
  'groupId',
  'customerId',
] as const;

type ComparedField = (typeof COMPARED_FIELDS)[number];
type CouponSettingsSnapshot = Pick<CouponRecord, ComparedField>;

/**
 * O que mudou, de e para. Ao contrário da edição de cadastro (§3.2.1), aqui o valor
 * entra na trilha: cupom não é dado pessoal, e "quem subiu o desconto de 10 para 50"
 * é exatamente a pergunta que se faz depois.
 */
function changedFields(
  current: CouponSettingsSnapshot,
  next: CouponSettingsSnapshot,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const field of COMPARED_FIELDS) {
    const before = current[field] ?? null;
    const after = next[field] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diff[field] = { from: before, to: after };
    }
  }
  return diff;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
