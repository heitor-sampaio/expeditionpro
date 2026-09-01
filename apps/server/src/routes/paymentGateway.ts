import {
  connectPaymentProvider,
  createBookingCharge,
  disconnectPaymentProvider,
  listPaymentIntegrations,
  listBookingCharges,
  listRecentCharges,
  quoteBookingCharge,
  reconcileCharge,
  settleChargeFromWebhook,
  updatePaymentFees,
} from '@expedition/application';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { BookingChargeView } from '@expedition/application';
import type { ServerDeps } from '../buildServer.js';

/**
 * PG-01/PG-02/PG-03 — rotas do gateway de pagamento.
 *
 * O **webhook é público** (o ASAAS não carrega JWT): ele diz o tenant pela URL e se prova
 * pelo cabeçalho `asaas-access-token`, que é o segredo gerado ao conectar. Responde 200
 * mesmo quando não reconhece o evento — erro faria o provedor reenviar em laço.
 */

const environment = z.enum(['sandbox', 'production']);

/**
 * O que se configura por forma de pagamento: só o custo de antecipar, **ao mês**. A taxa
 * da transação vem da simulação no provedor (PG-05).
 */
const feeRate = z.object({
  anticipationMonthlyBps: z.number().int().min(0),
  /** Dias entre parcelas liberadas sem antecipar. No ASAAS, 32. */
  settlementCycleDays: z.number().int().min(1).max(90).optional(),
});

const feeSettings = z.object({
  pix: feeRate.optional(),
  boleto: feeRate.optional(),
  card: feeRate.optional(),
});

export function registerPaymentGatewayRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/v1/payment-integrations', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listPaymentIntegrations({ integrations: deps.paymentIntegrations }, ctx);
    return reply.send(rows.map(toDto));
  });

  typed.post(
    '/v1/payment-integrations',
    {
      schema: {
        body: z.object({ environment, accessToken: z.string().trim().min(1) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const connected = await connectPaymentProvider(
        {
          integrations: deps.paymentIntegrations,
          gateway: deps.paymentGateway,
          audit: deps.audit,
          clock: deps.clock ?? (() => new Date()),
          newSecret: deps.newWebhookSecret,
        },
        ctx,
        request.body,
      );
      // O segredo do webhook sai **uma vez**, aqui: é o que a equipe cola no painel do
      // ASAAS. A listagem nunca o devolve.
      return reply.status(201).send({ ...toDto(connected), webhookToken: connected.webhookToken });
    },
  );

  typed.delete(
    '/v1/payment-integrations/:environment',
    { schema: { params: z.object({ environment }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await disconnectPaymentProvider(
        { integrations: deps.paymentIntegrations, audit: deps.audit },
        ctx,
        { environment: request.params.environment },
      );
      return reply.status(204).send();
    },
  );

  // PG-04 — taxas negociadas com o provedor, por ambiente. É o que faz a cobrança sair
  // pelo bruto e o líquido fechar o valor da inscrição.
  typed.put(
    '/v1/payment-integrations/:environment/fees',
    {
      schema: {
        params: z.object({ environment }),
        body: z.object({ feeSettings }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const saved = await updatePaymentFees(
        { integrations: deps.paymentIntegrations, audit: deps.audit },
        ctx,
        { environment: request.params.environment, feeSettings: request.body.feeSettings },
      );
      return reply.send(saved);
    },
  );

  // PG-02 — cobrança de uma inscrição. Sem `amountCents`, cobra o que falta pagar.
  typed.post(
    '/v1/bookings/:bookingId/charges',
    {
      schema: {
        params: z.object({ bookingId: z.string().min(1) }),
        body: z.object({
          environment,
          billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']),
          dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado YYYY-MM-DD'),
          amountCents: z.number().int().positive().optional(),
          installments: z.number().int().min(1).max(21).optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const charge = await createBookingCharge(
        {
          integrations: deps.paymentIntegrations,
          charges: deps.charges,
          gateway: deps.paymentGateway,
          bookings: deps.bookings,
          payments: deps.payments,
          customers: deps.customers,
          audit: deps.audit,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { bookingId: request.params.bookingId, ...request.body },
      );
      return reply.status(201).send({
        id: charge.id,
        externalId: charge.externalId,
        amountCents: Number(charge.amountCents),
        netAmountCents: Number(charge.netAmountCents),
        installments: charge.installments,
        billingType: charge.billingType,
        status: charge.status,
        invoiceUrl: charge.invoiceUrl,
      });
    },
  );

  // PG-06 — as cobranças de uma inscrição, na própria inscrição.
  typed.get(
    '/v1/bookings/:bookingId/charges',
    { schema: { params: z.object({ bookingId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const rows = await listBookingCharges({ charges: deps.charges }, ctx, {
        bookingId: request.params.bookingId,
      });
      return reply.send(rows.map(chargeDto));
    },
  );

  // PG-06 — as cobranças emitidas, no financeiro da empresa.
  typed.get(
    '/v1/charges',
    {
      schema: {
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const rows = await listRecentCharges(
        {
          charges: deps.charges,
          bookings: deps.bookings,
          customers: deps.customers,
          schedule: deps.schedule,
        },
        ctx,
        { limit: request.query.limit },
      );
      return reply.send(
        rows.map((row) => ({
          ...chargeDto(row),
          bookingId: row.bookingId,
          responsibleName: row.responsibleName,
          groupName: row.groupName,
        })),
      );
    },
  );

  // PG-07 — conciliação: pergunta ao provedor o que de fato caiu na conta.
  typed.post(
    '/v1/charges/:chargeId/reconcile',
    { schema: { params: z.object({ chargeId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const charge = await reconcileCharge(
        {
          charges: deps.charges,
          integrations: deps.paymentIntegrations,
          gateway: deps.paymentGateway,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { chargeId: request.params.chargeId },
      );
      return reply.send(settlementDto(charge));
    },
  );

  // PG-05 — quanto o provedor cobra por esta venda. A tela usa para mostrar o bruto
  // antes de emitir, com o mesmo número que a emissão vai usar.
  typed.post(
    '/v1/payment-quotes',
    {
      schema: {
        body: z.object({
          environment,
          billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']),
          netAmountCents: z.number().int().positive(),
          installments: z.number().int().min(1).max(21).optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const quote = await quoteBookingCharge(
        { integrations: deps.paymentIntegrations, gateway: deps.paymentGateway },
        ctx,
        request.body,
      );
      return reply.send(quote);
    },
  );

  // PG-03 — webhook do provedor. Público, autenticado pelo segredo no cabeçalho.
  typed.post(
    '/v1/webhooks/asaas/:tenantSlug',
    {
      schema: { params: z.object({ tenantSlug: z.string().min(1) }) },
      config: {
        rateLimit: {
          max: 300,
          timeWindow: '1 minute',
          keyGenerator: (request) =>
            (request.headers['asaas-access-token'] as string | undefined) ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const tenantId = await deps.tenants.findIdBySlug(request.params.tenantSlug);
      // Slug desconhecido responde igual a token errado: 401 não confirma existência.
      if (!tenantId) return reply.status(401).send({ error: 'unauthorized' });

      const token = (request.headers['asaas-access-token'] as string | undefined) ?? '';
      const outcome = await settleChargeFromWebhook(
        {
          integrations: deps.paymentIntegrations,
          charges: deps.charges,
          bookings: deps.bookings,
          payments: deps.payments,
          audit: deps.audit,
          clock: deps.clock ?? (() => new Date()),
        },
        { tenantId, actor: { kind: 'system' } },
        { token, body: request.body },
      );
      return reply.send({ handled: outcome.handled });
    },
  );
}

/** PG-07: o realizado que a conciliação trouxe. Null enquanto ninguém conciliou. */
function settlementDto(charge: {
  id: string;
  settledGrossCents: number | null;
  settledNetCents: number | null;
  awaitingCreditCents: number | null;
  anticipationFeeCents: number | null;
  paidInstallments: number | null;
  creditedInstallments: number | null;
  nextCreditDate: { year: number; month: number; day: number } | null;
  reconciledAt: Date | null;
}) {
  return {
    id: charge.id,
    settledGrossCents: charge.settledGrossCents,
    settledNetCents: charge.settledNetCents,
    awaitingCreditCents: charge.awaitingCreditCents,
    anticipationFeeCents: charge.anticipationFeeCents,
    paidInstallments: charge.paidInstallments,
    creditedInstallments: charge.creditedInstallments,
    nextCreditDate: charge.nextCreditDate ? isoOf(charge.nextCreditDate) : null,
    reconciledAt: charge.reconciledAt ? charge.reconciledAt.toISOString() : null,
  };
}

/** Datas em ISO, valores em centavos inteiros — como todo DTO daqui. */
function chargeDto(charge: BookingChargeView) {
  return {
    id: charge.id,
    externalId: charge.externalId,
    amountCents: charge.amountCents,
    netAmountCents: charge.netAmountCents,
    feeCents: charge.feeCents,
    installments: charge.installments,
    billingType: charge.billingType,
    dueDate: isoOf(charge.dueDate),
    status: charge.status,
    invoiceUrl: charge.invoiceUrl,
    paidAt: charge.paidAt ? charge.paidAt.toISOString() : null,
    createdAt: charge.createdAt.toISOString(),
    settledGrossCents: charge.settledGrossCents,
    settledNetCents: charge.settledNetCents,
    awaitingCreditCents: charge.awaitingCreditCents,
    anticipationFeeCents: charge.anticipationFeeCents,
    paidInstallments: charge.paidInstallments,
    creditedInstallments: charge.creditedInstallments,
    nextCreditDate: charge.nextCreditDate ? isoOf(charge.nextCreditDate) : null,
    reconciledAt: charge.reconciledAt ? charge.reconciledAt.toISOString() : null,
  };
}

function isoOf(date: { year: number; month: number; day: number }): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

/** A tela vê ambiente, conta, taxas e desde quando — nunca a chave. */
function toDto(integration: {
  environment: string;
  accountName: string | null;
  tokenPreview: string;
  connectedAt: Date;
  feeSettings?: unknown;
}) {
  return {
    environment: integration.environment,
    accountName: integration.accountName,
    tokenPreview: integration.tokenPreview,
    connectedAt: integration.connectedAt.toISOString(),
    feeSettings: integration.feeSettings ?? {},
  };
}
