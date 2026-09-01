import {
  allocateBooking,
  allocateManualBooking,
  buildGroupConvoyList,
  buildGroupInsuranceList,
  buildGroupRoomlist,
  cancelBooking,
  checkInBooking,
  confirmBookingManually,
  deletePayment,
  discountBookingTotal,
  getGroupBoard,
  listBookingPayments,
  markBookingInvoice,
  registerPayment,
  registerRefund,
  restoreBookingTablePrice,
  undoCheckIn,
} from '@expedition/application';
import { cents } from '@expedition/domain';
import {
  convoyFileName,
  insuranceFileName,
  renderConvoyPdf,
  renderConvoyXlsx,
  renderInsuranceXlsx,
  renderRoomlistPdf,
  roomlistFileName,
} from '@expedition/infrastructure';
import { z } from 'zod';
import type {
  AllocatedBooking,
  BookingRecord,
  GroupBoardView,
  DiscountedBooking,
  RestoredBooking,
  PaymentRecord,
  RegisteredPayment,
} from '@expedition/application';
import type { LocalDate } from '@expedition/domain';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';
import { fireBookingNotification } from './notify.js';

/**
 * Rotas de inscrição (GR-01/GR-03/GR-04 · IN-07/IN-18): alocar uma família num grupo
 * e sobrepor valores manualmente com motivo; e a leitura do grupo (GR-07/GR-13). O DTO
 * devolve o snapshot congelado e o total derivado (centavos).
 */

const allocateBody = z.object({
  groupId: z.string().min(1),
  responsibleCustomerId: z.string().min(1),
  participantCustomerIds: z.array(z.string().min(1)).min(1),
});

const manualBody = z.object({
  responsibleCustomerId: z.string().min(1),
  participantCustomerIds: z.array(z.string().min(1)).min(1),
  totalCents: z.number().int().nonnegative(),
  note: z.string().trim().min(1).optional(),
});

// GR-04 — o desconto de balcão é digitado sobre o total, em percentual ou em reais.
// O rateio entre os participantes é do domínio, não da borda nem da tela.
const discountBody = z.object({
  reason: z.string().trim().min(1),
  mode: z.enum(['percent', 'fixed']),
  value: z.number().nonnegative(),
});

export function registerBookingRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/v1/groups/:groupId/bookings',
    {
      schema: {
        params: z.object({ groupId: z.string().min(1) }),
        body: allocateBody.omit({ groupId: true }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const allocated = await allocateBooking(
        {
          bookings: deps.bookings,
          schedule: deps.schedule,
          itineraries: deps.itineraries,
          customers: deps.customers,
          cashback: deps.cashback,
        },
        ctx,
        // Alocação da equipe pela tela do app → `manual` (não gera cashback, §5.8).
        { groupId: request.params.groupId, ...request.body, source: 'manual' },
      );
      await fireBookingNotification(deps, request.log, ctx, allocated.booking.id, 'received');
      return reply.status(201).send(toDto(allocated.booking, allocated.totalCents));
    },
  );

  // AG-08: alocação em grupo de preço manual — valor livre do pacote, sem categorias.
  typed.post(
    '/v1/groups/:groupId/manual-bookings',
    {
      schema: {
        params: z.object({ groupId: z.string().min(1) }),
        body: manualBody,
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const allocated = await allocateManualBooking(
        {
          bookings: deps.bookings,
          schedule: deps.schedule,
          customers: deps.customers,
        },
        ctx,
        {
          groupId: request.params.groupId,
          responsibleCustomerId: request.body.responsibleCustomerId,
          participantCustomerIds: request.body.participantCustomerIds,
          totalCents: cents(request.body.totalCents),
          note: request.body.note ?? null,
        },
      );
      await fireBookingNotification(deps, request.log, ctx, allocated.booking.id, 'received');
      return reply.status(201).send(toDto(allocated.booking, allocated.totalCents));
    },
  );

  typed.post(
    '/v1/bookings/:bookingId/discount',
    {
      schema: {
        params: z.object({ bookingId: z.string().min(1) }),
        body: discountBody,
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const result: DiscountedBooking = await discountBookingTotal(
        { bookings: deps.bookings, payments: deps.payments, audit: deps.audit },
        ctx,
        {
          bookingId: request.params.bookingId,
          ...request.body,
        },
      );
      return reply.send(toDto(result.booking, result.totalCents));
    },
  );

  // GR-04 — desfaz o ajuste: volta ao preço que a tabela do roteiro diz para a saída.
  // Existe porque o ajuste só abate; sem esta volta, erro de digitação não tem conserto.
  typed.post(
    '/v1/bookings/:bookingId/restore-price',
    { schema: { params: z.object({ bookingId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const result: RestoredBooking = await restoreBookingTablePrice(
        {
          bookings: deps.bookings,
          customers: deps.customers,
          schedule: deps.schedule,
          itineraries: deps.itineraries,
          audit: deps.audit,
        },
        ctx,
        { bookingId: request.params.bookingId },
      );
      return reply.send(toDto(result.booking, result.totalCents));
    },
  );

  typed.get(
    '/v1/groups/:groupId/board',
    { schema: { params: z.object({ groupId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const board = await getGroupBoard(
        {
          schedule: deps.schedule,
          bookings: deps.bookings,
          payments: deps.payments,
          customers: deps.customers,
          vehicles: deps.vehicles,
        },
        ctx,
        { groupId: request.params.groupId },
      );
      return reply.send(boardToDto(board));
    },
  );

  /**
   * GR-15 — a roomlist do grupo, pronta para mandar ao hotel.
   *
   * GET porque é leitura: nada é criado e nada fica guardado. O arquivo é uma cópia
   * consolidada de CPF e endereço das famílias, então sai com `no-store` e a geração
   * vai para a trilha (o caso de uso registra).
   *
   * Sem `schema.response`: o serializador do fastify-type-provider-zod é global e
   * transformaria o Buffer em JSON.
   */
  typed.get(
    '/v1/groups/:groupId/roomlist.pdf',
    { schema: { params: z.object({ groupId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const view = await buildGroupRoomlist(
        {
          schedule: deps.schedule,
          bookings: deps.bookings,
          customers: deps.customers,
          tenants: deps.tenants,
          audit: deps.audit,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { groupId: request.params.groupId },
      );
      const bytes = await renderRoomlistPdf(view);
      const name = roomlistFileName(view.group.name, view.group.startDate);

      return reply
        .header('content-type', 'application/pdf')
        .header(
          'content-disposition',
          `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        )
        .header('cache-control', 'no-store')
        .send(Buffer.from(bytes));
    },
  );

  /**
   * GR-16 — a lista do seguro, no modelo da seguradora. Mesmas guardas da roomlist:
   * leitura, owner/admin, `no-store` e uma linha na trilha por geração.
   */
  typed.get(
    '/v1/groups/:groupId/seguro.xlsx',
    { schema: { params: z.object({ groupId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const view = await buildGroupInsuranceList(
        {
          schedule: deps.schedule,
          bookings: deps.bookings,
          customers: deps.customers,
          tenants: deps.tenants,
          audit: deps.audit,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { groupId: request.params.groupId },
      );
      const bytes = await renderInsuranceXlsx(view);
      const name = insuranceFileName(view.group.name, view.group.startDate);

      return reply
        .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header(
          'content-disposition',
          `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        )
        .header('cache-control', 'no-store')
        .send(Buffer.from(bytes));
    },
  );

  /**
   * GR-17 — a lista do comboio, no formato que a equipe escolher. Um recurso, dois
   * representações: o formato é do caminho (`.pdf` ou `.xlsx`), não um parâmetro, para
   * o nome do arquivo e o tipo do conteúdo saírem juntos e coerentes.
   */
  typed.get(
    '/v1/groups/:groupId/comboio.:format',
    {
      schema: {
        params: z.object({
          groupId: z.string().min(1),
          format: z.enum(['pdf', 'xlsx']),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const view = await buildGroupConvoyList(
        {
          schedule: deps.schedule,
          bookings: deps.bookings,
          customers: deps.customers,
          vehicles: deps.vehicles,
          tenants: deps.tenants,
          audit: deps.audit,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { groupId: request.params.groupId },
      );

      const pdf = request.params.format === 'pdf';
      const bytes = pdf ? await renderConvoyPdf(view) : await renderConvoyXlsx(view);
      const name = convoyFileName(view.group.name, view.group.startDate, request.params.format);

      return reply
        .header(
          'content-type',
          pdf
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        .header(
          'content-disposition',
          `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        )
        .header('cache-control', 'no-store')
        .send(Buffer.from(bytes));
    },
  );

  // GR-14 — check-in da inscrição. As duas audiências usam a mesma rota: o cliente pelo
  // app, a equipe na mesa do grupo. A régua (janela da saída, status) é do caso de uso.
  typed.post(
    '/v1/bookings/:bookingId/checkin',
    { schema: { params: z.object({ bookingId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const booking = await checkInBooking(
        {
          bookings: deps.bookings,
          customers: deps.customers,
          schedule: deps.schedule,
          audit: deps.audit,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { bookingId: request.params.bookingId },
      );
      return reply.send({ checkedInAt: booking.checkedInAt?.toISOString() ?? null });
    },
  );

  // GR-14 — desfazer é da equipe: o cliente marca e não volta atrás.
  typed.delete(
    '/v1/bookings/:bookingId/checkin',
    { schema: { params: z.object({ bookingId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await undoCheckIn({ bookings: deps.bookings, audit: deps.audit }, ctx, {
        bookingId: request.params.bookingId,
      });
      return reply.status(204).send();
    },
  );

  // §3.6 — devolução: em dinheiro (sai do caixa) ou convertida em crédito do cliente
  // (nem receita, nem despesa). Devolvido tudo, a inscrição é cancelada no mesmo ato.
  typed.post(
    '/v1/bookings/:bookingId/refunds',
    {
      schema: {
        params: z.object({ bookingId: z.string().min(1) }),
        body: z.object({
          amountCents: z.number().int().positive(),
          destination: z.enum(['cash', 'cashback']),
          method: z.enum(['pix', 'boleto', 'card', 'cash']).optional(),
          paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado YYYY-MM-DD'),
          reason: z.string().trim().min(1),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const result = await registerRefund(
        {
          payments: deps.payments,
          bookings: deps.bookings,
          cashback: deps.cashback,
          audit: deps.audit,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { bookingId: request.params.bookingId, ...request.body },
      );
      return reply.status(201).send(result);
    },
  );

  typed.post(
    '/v1/bookings/:bookingId/payments',
    { schema: { params: z.object({ bookingId: z.string().min(1) }), body: paymentBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const result: RegisteredPayment = await registerPayment(
        {
          payments: deps.payments,
          bookings: deps.bookings,
          audit: deps.audit,
          integrations: deps.paymentIntegrations,
          gateway: deps.paymentGateway,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { bookingId: request.params.bookingId, ...request.body },
      );
      if (result.confirmedNow) {
        // IN-08: o primeiro recebimento confirma — avisa o cliente (PC-23)
        await fireBookingNotification(
          deps,
          request.log,
          ctx,
          request.params.bookingId,
          'confirmed',
        );
      }
      return reply.status(201).send(paymentToDto(result));
    },
  );

  // IN-11: recebimentos ativos de uma inscrição — para escolher qual excluir na mesa
  typed.get(
    '/v1/bookings/:bookingId/payments',
    { schema: { params: z.object({ bookingId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const rows = await listBookingPayments({ payments: deps.payments }, ctx, {
        bookingId: request.params.bookingId,
      });
      return reply.send(rows.map(paymentRecordDto));
    },
  );

  const clock = () => deps.clock?.() ?? new Date();

  typed.post(
    '/v1/bookings/:bookingId/confirm',
    {
      schema: {
        params: z.object({ bookingId: z.string().min(1) }),
        body: z.object({ note: z.string().trim().min(1) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const booking = await confirmBookingManually(
        { bookings: deps.bookings, audit: deps.audit, clock },
        ctx,
        {
          bookingId: request.params.bookingId,
          note: request.body.note,
        },
      );
      return reply.send(statusDto(booking));
    },
  );

  typed.post(
    '/v1/bookings/:bookingId/cancel',
    {
      schema: {
        params: z.object({ bookingId: z.string().min(1) }),
        body: z.object({ reason: z.string().trim().min(1) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const booking = await cancelBooking(
        { bookings: deps.bookings, coupons: deps.coupons, audit: deps.audit, clock },
        ctx,
        { bookingId: request.params.bookingId, reason: request.body.reason },
      );
      return reply.send(statusDto(booking));
    },
  );

  typed.post(
    '/v1/bookings/:bookingId/invoice',
    {
      schema: {
        params: z.object({ bookingId: z.string().min(1) }),
        body: z.object({
          checked: z.boolean(),
          invoiceNumber: z.string().optional(),
          issuedAt: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const invoice = await markBookingInvoice({ bookings: deps.bookings, clock }, ctx, {
        bookingId: request.params.bookingId,
        ...request.body,
      });
      return reply.send({
        bookingId: request.params.bookingId,
        checked: invoice.checked,
        invoiceNumber: invoice.invoiceNumber,
        invoiceIssuedAt: invoice.invoiceIssuedAt ? isoOf(invoice.invoiceIssuedAt) : null,
      });
    },
  );

  typed.delete(
    '/v1/payments/:paymentId',
    { schema: { params: z.object({ paymentId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const result = await deletePayment(
        { payments: deps.payments, bookings: deps.bookings, audit: deps.audit },
        ctx,
        {
          paymentId: request.params.paymentId,
        },
      );
      return reply.send(result);
    },
  );
}

function statusDto(booking: BookingRecord) {
  return { id: booking.id, status: booking.status };
}

const paymentBody = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(['pix', 'boleto', 'card', 'cash']),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado YYYY-MM-DD'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

function paymentRecordDto(payment: PaymentRecord) {
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    /** PG-08: o que quita a inscrição — já líquido quando a taxa foi repassada. */
    amountCents: Number(payment.amountCents),
    /** PG-08: o que o cliente pagou, quando difere. */
    customerPaidCents: payment.customerPaidCents,
    chargeId: payment.chargeId,
    kind: payment.kind,
    method: payment.method,
    paidAt: isoOf(payment.paidAt),
    reference: payment.reference,
  };
}

function paymentToDto({ payment, confirmedNow }: RegisteredPayment) {
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    amountCents: Number(payment.amountCents),
    method: payment.method,
    paidAt: isoOf(payment.paidAt),
    reference: payment.reference,
    confirmedNow,
  };
}

function boardToDto(board: GroupBoardView) {
  return {
    group: {
      id: board.group.id,
      scheduleEventId: board.group.scheduleEventId,
      name: board.group.name,
      itineraryId: board.group.itineraryId,
      startDate: isoOf(board.group.startDate),
      endDate: isoOf(board.group.endDate),
      status: board.group.status,
      visibility: board.group.visibility,
      pricingMode: board.group.pricingMode,
    },
    rows: board.rows.map(boardRowDto),
    totals: board.totals,
    occupancy: board.occupancy,
  };
}

function isoOf(date: LocalDate): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

function toDto(booking: BookingRecord, totalCents: AllocatedBooking['totalCents']) {
  return {
    id: booking.id,
    groupId: booking.groupId,
    responsibleCustomerId: booking.responsibleCustomerId,
    status: booking.status,
    source: booking.source,
    totalCents: Number(totalCents),
    participants: booking.participants.map((participant) => ({
      customerId: participant.customerId,
      priceCategory: participant.priceCategory,
      unitPriceCents: Number(participant.unitPriceCents),
      priceSource: participant.priceSource,
      priceNote: participant.priceNote,
    })),
  };
}

function boardRowDto(row: GroupBoardView['rows'][number]) {
  return {
    checkedInAt: row.checkedInAt ? row.checkedInAt.toISOString() : null,
    vehicle: row.vehicle,
    coupon: row.coupon,
    priceAdjusted: row.priceAdjusted,
    bookingId: row.bookingId,
    responsibleCustomerId: row.responsibleCustomerId,
    responsibleName: row.responsibleName,
    status: row.status,
    contractedCents: row.contractedCents,
    receivedCents: row.receivedCents,
    dueCents: row.dueCents,
    occupiesVehicle: row.occupiesVehicle,
    invoiceChecked: row.invoiceChecked,
    participants: row.participants,
  };
}
