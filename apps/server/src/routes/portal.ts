import {
  listOpenExpeditions,
  listPortalFamily,
  registerFamilyCompanion,
  requestIdentityChange,
  savePortalVehicle,
  listEnrollmentRequests,
  requestSelfEnrollment,
  updateCustomerContact,
} from '@expedition/application';
import { formatPhone, formatPlate, maskCpf, type LocalDate } from '@expedition/domain';
import { z } from 'zod';
import type {
  CustomerRecord,
  FamilyMember,
  OpenExpedition,
  VehicleRecord,
} from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Rotas do portal do cliente (§3.7 / PC-06 / PC-08). Escrita do cliente mediada pelo
 * servidor (a RLS do cliente é SELECT-only). O ator e o escopo de família são checados
 * nos casos de uso; identidade (nome/CPF/nascimento) nunca é editável aqui (PC-07).
 * Toda resposta é DTO com CPF mascarado (SEC-04).
 */

const addressBody = z.object({
  street: z.string().optional(),
  number: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
});

const contactBody = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  address: addressBody.optional(),
});

const companionBody = z.object({
  fullName: z.string().trim().min(1),
  cpf: z.string().min(1),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado YYYY-MM-DD'),
  email: z.string().optional(),
  phone: z.string().optional(),
});

const vehicleBody = z.object({
  customerId: z.string().min(1),
  brandId: z.string().optional(),
  brandOther: z.string().optional(),
  modelId: z.string().optional(),
  modelOther: z.string().optional(),
  plate: z.string().min(1),
});

export function registerPortalRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // PC-06 — edição de contato e endereço da própria família
  typed.patch(
    '/v1/portal/customers/:id/contact',
    { schema: { params: z.object({ id: z.string().min(1) }), body: contactBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const address = request.body.address
        ? {
            street: request.body.address.street ?? null,
            number: request.body.address.number ?? null,
            district: request.body.address.district ?? null,
            city: request.body.address.city ?? null,
            state: request.body.address.state ?? null,
            zip: request.body.address.zip ?? null,
          }
        : undefined;
      const updated = await updateCustomerContact({ customers: deps.customers }, ctx, {
        customerId: request.params.id,
        email: request.body.email,
        phone: request.body.phone,
        address,
      });
      return reply.send(customerDto(updated));
    },
  );

  // PC-08 — cadastrar acompanhante na própria família
  typed.post(
    '/v1/portal/companions',
    { schema: { body: companionBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const created = await registerFamilyCompanion(
        { customers: deps.customers },
        ctx,
        request.body,
      );
      return reply.status(201).send(customerDto(created));
    },
  );

  // PC-07 — pedir mudança de identidade (entra na fila de aprovação, não aplica)
  typed.post(
    '/v1/portal/identity-change-requests',
    {
      schema: {
        // Pelo portal o cliente só solicita mudança de **nome** (PC-07). CPF e data de
        // nascimento são identidade sensível — só a equipe altera, no back-office. O schema
        // não aceita esses campos: qualquer `birthDate`/`cpf` enviado é descartado aqui.
        body: z.object({
          customerId: z.string().min(1),
          fullName: z.string().trim().min(1).optional(),
          reason: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const created = await requestIdentityChange(
        { customers: deps.customers, identityRequests: deps.identityRequests },
        ctx,
        request.body,
      );
      return reply.status(201).send({ id: created.id, status: created.status });
    },
  );

  // PC-06 — anexar/editar veículo de um membro da família
  typed.post('/v1/portal/vehicles', { schema: { body: vehicleBody } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const vehicle = await savePortalVehicle(
      { customers: deps.customers, vehicles: deps.vehicles },
      ctx,
      request.body,
    );
    return reply.status(201).send(vehicleDto(vehicle));
  });

  // §5.8 — saídas abertas (agenda do portal) e a família do cliente para o seletor.
  typed.get('/v1/portal/expeditions', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listOpenExpeditions(
      { schedule: deps.schedule, bookings: deps.bookings, itineraries: deps.itineraries },
      ctx,
    );
    return reply.send(rows.map(expeditionDto));
  });

  typed.get('/v1/portal/family', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const family = await listPortalFamily({ customers: deps.customers }, ctx);
    return reply.send(family.map(familyMemberDto));
  });

  // §5.8 — pedidos do cliente aguardando a revisão da equipe ("em análise")
  typed.get('/v1/portal/enrollment-requests', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listEnrollmentRequests(
      { customers: deps.customers, intake: deps.intake },
      ctx,
    );
    return reply.send(rows);
  });

  // §5.8 — auto-inscrição do cliente numa saída aberta. É a ÚNICA origem que gera cashback.
  typed.post(
    '/v1/portal/groups/:groupId/enroll',
    {
      schema: {
        params: z.object({ groupId: z.string().min(1) }),
        body: z.object({ participantCustomerIds: z.array(z.string().min(1)).min(1) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const requested = await requestSelfEnrollment(
        {
          customers: deps.customers,
          schedule: deps.schedule,
          intake: deps.intake,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        {
          groupId: request.params.groupId,
          participantCustomerIds: request.body.participantCustomerIds,
        },
      );
      // §5.8: o pedido entra na fila da equipe; ainda não é inscrição no grupo.
      return reply.status(201).send({ intakeId: requested.intakeId, status: 'pending_review' });
    },
  );
}

function customerDto(customer: CustomerRecord) {
  return {
    id: customer.id,
    fullName: customer.fullName,
    cpf: maskCpf(customer.cpf), // portal: CPF do próprio cliente mascarado por padrão
    birthDate: isoDate(customer.birthDate),
    email: customer.email,
    phone: customer.phone ? formatPhone(customer.phone) : null,
    address: customer.address,
    role: customer.responsibleId === null ? 'responsible' : 'companion',
  };
}

function vehicleDto(vehicle: VehicleRecord) {
  return {
    id: vehicle.id,
    customerId: vehicle.customerId,
    brandId: vehicle.brandId,
    modelId: vehicle.modelId,
    brandOther: vehicle.brandOther,
    modelOther: vehicle.modelOther,
    needsCatalogReview: vehicle.needsCatalogReview,
    plate: formatPlate(vehicle.plate),
  };
}

function expeditionDto(exp: OpenExpedition) {
  return {
    groupId: exp.groupId,
    itineraryId: exp.itineraryId,
    itineraryName: exp.itineraryName,
    startDate: isoDate(exp.startDate),
    endDate: isoDate(exp.endDate),
    confirmedCount: exp.confirmedCount,
    vacancies: exp.vacancies,
  };
}

function familyMemberDto(member: FamilyMember) {
  return {
    id: member.id,
    fullName: member.fullName,
    birthDate: isoDate(member.birthDate),
    email: member.email,
    phone: member.phone ? formatPhone(member.phone) : null,
    role: member.role,
  };
}

function isoDate(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}
