import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from '@expedition/application';
import { z } from 'zod';
import type { CouponListItem, CouponRecord } from '@expedition/application';
import type { LocalDate } from '@expedition/domain';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Rotas de cupom (§5.15, CP-01..CP-04): a gestão da campanha em Configurações →
 * Promoções. Aplicar cupom numa inscrição fica em `bookings.ts`, junto do resto do
 * dinheiro da inscrição.
 *
 * O DTO é explícito e não devolve `createdBy` nem `tenantId` — a tela precisa da regra
 * e do uso, não de quem clicou (isso vive na trilha).
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

const couponBody = z.object({
  code: z.string().trim().min(1),
  mode: z.enum(['percent', 'fixed']),
  value: z.number().int().positive(),
  description: z.string().trim().nullable().optional(),
  validFrom: isoDate,
  validUntil: isoDate,
  maxUses: z.number().int().nullable().optional(),
  maxUsesPerCustomer: z.number().int().nullable().optional(),
  itineraryId: z.string().min(1).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
  customerId: z.string().min(1).nullable().optional(),
});

const patchBody = couponBody.partial().omit({ code: true }).extend({
  active: z.boolean().optional(),
});

export function registerCouponRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/v1/coupons', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const coupons = await listCoupons({ coupons: deps.coupons }, ctx);
    return reply.send(coupons.map(listDto));
  });

  typed.post('/v1/coupons', { schema: { body: couponBody } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const coupon = await createCoupon(
      { coupons: deps.coupons, audit: deps.audit },
      ctx,
      request.body,
    );
    return reply.status(201).send({ ...couponDto(coupon), uses: 0 });
  });

  typed.patch(
    '/v1/coupons/:couponId',
    { schema: { params: z.object({ couponId: z.string().min(1) }), body: patchBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const coupon = await updateCoupon({ coupons: deps.coupons, audit: deps.audit }, ctx, {
        couponId: request.params.couponId,
        ...request.body,
      });
      const uses = await deps.coupons.countActiveByCoupon(ctx.tenantId);
      return reply.send({ ...couponDto(coupon), uses: uses[coupon.id] ?? 0 });
    },
  );

  typed.delete(
    '/v1/coupons/:couponId',
    { schema: { params: z.object({ couponId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await deleteCoupon({ coupons: deps.coupons, audit: deps.audit }, ctx, {
        couponId: request.params.couponId,
      });
      return reply.status(204).send();
    },
  );
}

interface CouponDto {
  readonly id: string;
  readonly code: string;
  readonly description: string | null;
  readonly mode: string;
  readonly value: number;
  readonly active: boolean;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly maxUses: number | null;
  readonly maxUsesPerCustomer: number | null;
  readonly itineraryId: string | null;
  readonly groupId: string | null;
  readonly customerId: string | null;
}

function couponDto(coupon: CouponRecord): CouponDto {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    mode: coupon.mode,
    value: coupon.value,
    active: coupon.active,
    validFrom: isoOf(coupon.validFrom),
    validUntil: isoOf(coupon.validUntil),
    maxUses: coupon.maxUses,
    maxUsesPerCustomer: coupon.maxUsesPerCustomer,
    itineraryId: coupon.itineraryId,
    groupId: coupon.groupId,
    customerId: coupon.customerId,
  };
}

function listDto(coupon: CouponListItem): CouponDto & { uses: number } {
  return { ...couponDto(coupon), uses: coupon.uses };
}

function isoOf(date: LocalDate | null): string | null {
  if (date === null) return null;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(date.year)}-${pad(date.month)}-${pad(date.day)}`;
}
