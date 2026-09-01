import {
  cancelGroup,
  createScheduleEvent,
  deleteScheduleEvent,
  listAgendaEvents,
  listOpenGroups,
  updateScheduleEvent,
} from '@expedition/application';
import { coreFormSchema } from '@expedition/domain';
import { z } from 'zod';
import type { AgendaEvent, OpenGroup, ScheduleEventWithGroup } from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Rotas da agenda (AG-02..05): criar evento — que gera o grupo —, listar, editar
 * (propaga ao grupo) e excluir (bloqueado com inscrições). O DTO expõe evento + grupo
 * juntos, que é como a agenda e o calendário leem.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado YYYY-MM-DD');

const createBody = z.object({
  itineraryId: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  title: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
  capacityVehicles: z.number().int().positive().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  pricingMode: z.enum(['itinerary', 'manual']).optional(),
});

const updateBody = z.object({
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export function registerScheduleRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post('/v1/schedule-events', { schema: { body: createBody } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const created = await createScheduleEvent(
      { schedule: deps.schedule, itineraries: deps.itineraries },
      ctx,
      request.body,
    );
    return reply.status(201).send(toDto(created));
  });

  typed.get('/v1/schedule-events', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listAgendaEvents({ schedule: deps.schedule, bookings: deps.bookings }, ctx);
    return reply.send(rows.map(agendaDto));
  });

  typed.patch(
    '/v1/schedule-events/:id',
    { schema: { params: z.object({ id: z.string().min(1) }), body: updateBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const updated = await updateScheduleEvent(
        { schedule: deps.schedule, itineraries: deps.itineraries },
        ctx,
        { eventId: request.params.id, ...request.body },
      );
      return reply.send(toDto(updated));
    },
  );

  typed.delete(
    '/v1/schedule-events/:id',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await deleteScheduleEvent(
        {
          schedule: deps.schedule,
          bookings: deps.bookings,
          suppliers: deps.suppliers,
          payments: deps.payments,
          intake: deps.intake,
        },
        ctx,
        { eventId: request.params.id },
      );
      return reply.status(204).send();
    },
  );

  // AG-05 — cancelar a saída: o grupo não some, sai da vitrine e o motivo fica na trilha
  typed.post(
    '/v1/groups/:groupId/cancel',
    {
      schema: {
        params: z.object({ groupId: z.string().min(1) }),
        body: z.object({ reason: z.string().trim().min(1) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const group = await cancelGroup({ schedule: deps.schedule, audit: deps.audit }, ctx, {
        groupId: request.params.groupId,
        reason: request.body.reason,
      });
      return reply.send({ id: group.id, name: group.name, status: group.status });
    },
  );

  // IN-24: vitrine pública — sem autenticação, resolvida pelo slug do tenant.
  typed.get(
    '/v1/public/:tenantSlug/groups',
    {
      schema: {
        params: z.object({ tenantSlug: z.string().min(1) }),
        querystring: z.object({ status: z.literal('open') }),
      },
      // SEC-14: endpoint público sem auth → limite dedicado por IP, mais apertado que o global.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const groups = await listOpenGroups({ schedule: deps.schedule }, request.params.tenantSlug);
      return reply.send(groups.map(openGroupDto));
    },
  );

  // IN-24: schema do formulário público — campos que o tenant espera receber. Estático no
  // v1 (núcleo), sem dado de cliente. Leitura pública com o mesmo limite apertado por IP.
  typed.get(
    '/v1/public/:tenantSlug/form-schema',
    {
      schema: { params: z.object({ tenantSlug: z.string().min(1) }) },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (_request, reply) => {
      return reply.send(coreFormSchema());
    },
  );
}

function openGroupDto(group: OpenGroup) {
  return {
    groupId: group.groupId,
    name: group.name,
    itineraryName: group.itineraryName,
    startDate: isoOf(group.startDate),
    endDate: isoOf(group.endDate),
  };
}

function agendaDto(row: AgendaEvent) {
  return {
    ...toDto({ event: row.event, group: row.group }),
    occupancy: row.occupancy,
  };
}

function toDto({ event, group }: ScheduleEventWithGroup) {
  return {
    id: event.id,
    itineraryId: event.itineraryId,
    startDate: isoOf(event.startDate),
    endDate: isoOf(event.endDate),
    title: event.title,
    status: event.status,
    group: {
      id: group.id,
      name: group.name,
      status: group.status,
      capacityVehicles: group.capacityVehicles,
      visibility: group.visibility,
      pricingMode: group.pricingMode,
    },
  };
}

function isoOf(date: { year: number; month: number; day: number }): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}
