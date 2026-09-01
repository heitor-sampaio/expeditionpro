import {
  accrueCashback,
  expireCashback,
  getCashbackConfig,
  getCashbackStatement,
  redeemCashback,
  updateCashbackConfig,
} from '@expedition/application';
import { z } from 'zod';
import type { CashbackEntryRecord } from '@expedition/application';
import type { CashbackConfig, LocalDate } from '@expedition/domain';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

const configBody = z.object({
  enabled: z.boolean(),
  mode: z.enum(['percent', 'fixed']),
  value: z.number().int().nonnegative(),
  base: z.enum(['paid', 'contracted']),
  releaseDays: z.number().int().nonnegative(),
  validityMonths: z.number().int().nonnegative(),
  maxRedemptionPct: z.number().int().min(0).max(100),
});

/**
 * Rotas de cashback (§5.8): liberar (accrual), resgatar (redemption) e o extrato do
 * cliente. Saldo e extrato sempre derivados do ledger.
 */
export function registerCashbackRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/v1/bookings/:bookingId/cashback/accrue',
    { schema: { params: z.object({ bookingId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const result = await accrueCashback(
        {
          bookings: deps.bookings,
          payments: deps.payments,
          schedule: deps.schedule,
          cashback: deps.cashback,
        },
        ctx,
        { bookingId: request.params.bookingId },
      );
      return reply.status(201).send(result);
    },
  );

  typed.post(
    '/v1/bookings/:bookingId/cashback/redeem',
    {
      schema: {
        params: z.object({ bookingId: z.string().min(1) }),
        body: z.object({ amountCents: z.number().int().positive() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const result = await redeemCashback(
        { bookings: deps.bookings, cashback: deps.cashback },
        ctx,
        {
          bookingId: request.params.bookingId,
          amountCents: request.body.amountCents,
        },
      );
      return reply.status(201).send(result);
    },
  );

  // CB-02 — leitura da config de cashback da empresa
  typed.get('/v1/cashback/config', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const config = await getCashbackConfig({ cashback: deps.cashback }, ctx);
    return reply.send(config);
  });

  // CB-01/CB-02 — atualização da config (owner/admin)
  typed.put('/v1/cashback/config', { schema: { body: configBody } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const saved = await updateCashbackConfig(
      { cashback: deps.cashback },
      ctx,
      request.body as CashbackConfig,
    );
    return reply.send(saved);
  });

  typed.get(
    '/v1/customers/:customerId/cashback',
    { schema: { params: z.object({ customerId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const stmt = await getCashbackStatement({ cashback: deps.cashback, clock: deps.clock }, ctx, {
        customerId: request.params.customerId,
      });
      return reply.send({
        balanceCents: stmt.balanceCents,
        availableCents: stmt.availableCents,
        entries: stmt.entries.map(entryDto),
      });
    },
  );

  // CB-07: job de expiração — lança as entradas `expiry` do cashback vencido (equipe).
  typed.post('/v1/cashback/expire', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const result = await expireCashback({ cashback: deps.cashback, clock: deps.clock }, ctx);
    return reply.send(result);
  });
}

function entryDto(entry: CashbackEntryRecord) {
  return {
    id: entry.id,
    bookingId: entry.bookingId,
    type: entry.type,
    amountCents: Number(entry.amountCents),
    availableFrom: entry.availableFrom ? isoOf(entry.availableFrom) : null,
    expiresAt: entry.expiresAt ? isoOf(entry.expiresAt) : null,
  };
}

function isoOf(date: LocalDate): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}
