import {
  denyCustomer,
  getCustomerFamily,
  getCustomerFile,
  invitePortalCustomer,
  mergeCustomers,
  moveToResponsible,
  promoteToResponsible,
  registerCompanion,
  registerCustomer,
  removeCompanion,
  searchCustomers,
  updateCustomer,
} from '@expedition/application';
import {
  formatCep,
  formatCpf,
  formatLocalDateBR,
  formatPhone,
  type LocalDate,
} from '@expedition/domain';
import { z } from 'zod';
import type {
  Address,
  CustomerFile,
  CustomerFileExpedition,
  CustomerRecord,
  Family,
} from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Rotas de clientes. A borda valida o formato com Zod (parse, don't validate); as
 * regras (dígito verificador, unicidade, dois níveis, limite) ficam nos casos de uso.
 * Toda resposta é DTO com CPF mascarado (SEC-03/04), nunca a entidade.
 */

const addressBody = z.object({
  street: z.string().optional(),
  number: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
});

const customerBody = z.object({
  fullName: z.string().trim().min(1),
  cpf: z.string().min(1),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado YYYY-MM-DD'),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: addressBody.optional(),
});

const customerPatchBody = z.object({
  fullName: z.string().trim().min(1).optional(),
  cpf: z.string().min(1).optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'esperado YYYY-MM-DD')
    .optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: addressBody.optional(),
});

export function registerCustomerRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // CL-01 — cadastro de responsável
  typed.post('/v1/customers', { schema: { body: customerBody } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const created = await registerCustomer({ customers: deps.customers }, ctx, request.body);
    return reply.status(201).send(toDto(created));
  });

  // CL-03 — adicionar acompanhante à família de um responsável
  typed.post(
    '/v1/customers/:id/companions',
    { schema: { params: z.object({ id: z.string().min(1) }), body: customerBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      /*
       * SEC-01: a rota de back-office pendura em QUALQUER cliente, então barra o cliente
       * aqui. O caso de uso fica sem guarda de propósito: o portal chega nele por
       * `registerFamilyCompanion`/`savePortalVehicle`, que escopam à própria família.
       * Guarda no caso de uso compartilhado quebraria o caminho legítimo do cliente.
       */
      denyCustomer(ctx);
      const created = await registerCompanion({ customers: deps.customers }, ctx, {
        responsibleId: request.params.id,
        ...request.body,
      });
      return reply.status(201).send(toDto(created));
    },
  );

  // CL-04 — lista todos ou busca por nome/CPF/telefone; ordena por nome ou criação
  typed.get(
    '/v1/customers',
    {
      schema: {
        querystring: z.object({
          q: z.string().optional(),
          sort: z.enum(['name', 'created']).optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const families = await searchCustomers({ customers: deps.customers }, ctx, {
        query: request.query.q ?? '',
        sort: request.query.sort ?? 'name',
      });
      return reply.send(families.map(familyToDto));
    },
  );

  // CL-06 — a família com os dados completos, para o editor do back-office
  typed.get(
    '/v1/customers/:id/family',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const family = await getCustomerFamily({ customers: deps.customers }, ctx, {
        customerId: request.params.id,
      });
      return reply.send(familyToDto(family));
    },
  );

  // CL-06 — a equipe edita a ficha (identidade + contato + endereço). O cliente, pelo
  // portal, não passa por aqui: pede mudança de identidade (PC-07) e edita só contato.
  typed.patch(
    '/v1/customers/:id',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: customerPatchBody,
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const updated = await updateCustomer({ customers: deps.customers, audit: deps.audit }, ctx, {
        customerId: request.params.id,
        ...request.body,
      });
      return reply.send(toDto(updated));
    },
  );

  // CL-03 — remover acompanhante cadastrado por engano (quem já viajou tem histórico)
  typed.delete(
    '/v1/customers/:id',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await removeCompanion(
        {
          customers: deps.customers,
          bookings: deps.bookings,
          cashback: deps.cashback,
          audit: deps.audit,
        },
        ctx,
        { customerId: request.params.id },
      );
      return reply.status(204).send();
    },
  );

  // CL-10 — vincular a um responsável (mover / vincular como acompanhante)
  typed.post(
    '/v1/customers/:id/move',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({ responsibleId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const moved = await moveToResponsible({ customers: deps.customers, audit: deps.audit }, ctx, {
        customerId: request.params.id,
        responsibleId: request.body.responsibleId,
      });
      return reply.send(toDto(moved));
    },
  );

  // CL-10 — tornar responsável (opcionalmente levando acompanhantes)
  typed.post(
    '/v1/customers/:id/promote',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({ bringCompanionIds: z.array(z.string()).optional() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const promoted = await promoteToResponsible(
        { customers: deps.customers, audit: deps.audit },
        ctx,
        {
          customerId: request.params.id,
          bringCompanionIds: request.body.bringCompanionIds,
        },
      );
      return reply.send(toDto(promoted));
    },
  );

  // CL-06 — ficha do cliente: expedições, financeiro e cashback numa leitura só
  typed.get(
    '/v1/customers/:id/file',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const file = await getCustomerFile(
        {
          customers: deps.customers,
          bookings: deps.bookings,
          schedule: deps.schedule,
          payments: deps.payments,
          cashback: deps.cashback,
        },
        ctx,
        { customerId: request.params.id },
      );
      return reply.send(fileToDto(file));
    },
  );

  // PC-01/PC-02 — convidar o cliente ao portal (cria conta no Supabase Auth)
  typed.post(
    '/v1/customers/:id/portal-invite',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      if (!deps.authAdmin) {
        return reply.status(503).send({ error: 'auth_admin_unavailable' });
      }
      const ctx = await deps.resolveContext(request);
      const invited = await invitePortalCustomer(
        {
          customers: deps.customers,
          authAdmin: deps.authAdmin,
          audit: deps.audit,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { customerId: request.params.id },
      );
      return reply.status(201).send({ userId: invited.userId, actionLink: invited.actionLink });
    },
  );

  // CL-07 — merge de duplicados
  typed.post(
    '/v1/customers/merge',
    {
      schema: { body: z.object({ survivorId: z.string().min(1), duplicateId: z.string().min(1) }) },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const survivor = await mergeCustomers(
        { customers: deps.customers, vehicles: deps.vehicles, audit: deps.audit },
        ctx,
        request.body,
      );
      return reply.send(toDto(survivor));
    },
  );
}

interface CustomerDto {
  id: string;
  fullName: string;
  cpf: string;
  birthDate: string;
  email: string | null;
  phone: string | null;
  address: Address;
  role: 'responsible' | 'companion';
}

function toDto(customer: CustomerRecord): CustomerDto {
  return {
    id: customer.id,
    fullName: customer.fullName,
    cpf: formatCpf(customer.cpf), // back-office: CPF completo pontuado (a equipe é audiência autorizada)
    birthDate: formatLocalDateBR(customer.birthDate),
    email: customer.email,
    phone: displayPhone(customer.phone),
    address: displayAddress(customer.address),
    role: customer.responsibleId === null ? 'responsible' : 'companion',
  };
}

/** Telefone E.164 (dígitos) → exibição `+55 (48)99999-8877`; null permanece null. */
function displayPhone(phone: string | null): string | null {
  return phone ? formatPhone(phone) : null;
}

/** Endereço com CEP pontuado (xxxxx-xxx) para exibição. */
function displayAddress(address: Address): Address {
  return { ...address, zip: address.zip ? formatCep(address.zip) : null };
}

function familyToDto(family: Family): { responsible: CustomerDto; companions: CustomerDto[] } {
  return {
    responsible: toDto(family.responsible),
    companions: family.companions.map(toDto),
  };
}

interface ExpeditionDto {
  bookingId: string;
  groupId: string;
  groupName: string;
  startDate: string;
  endDate: string;
  status: string;
  role: 'responsible' | 'companion';
  participantCount: number;
  contractedCents: number;
  receivedCents: number;
  dueCents: number;
  checkedInAt: string | null;
}

/** DTO da ficha (CL-06): CPF mascarado, datas em ISO, valores em centavos inteiros. */
function fileToDto(file: CustomerFile) {
  return {
    customer: {
      id: file.customer.id,
      fullName: file.customer.fullName,
      cpf: formatCpf(file.customer.cpf),
      birthDate: formatLocalDateBR(file.customer.birthDate),
      email: file.customer.email,
      phone: displayPhone(file.customer.phone),
      address: displayAddress(file.customer.address),
      role: file.customer.role,
    },
    // Família só com id e nome — o suficiente para as ações de vínculo (CL-10) sem
    // repetir dado pessoal de quem não é o cliente da ficha.
    family: {
      responsible: file.family.responsible,
      companions: file.family.companions,
    },
    expeditions: file.expeditions.map(expeditionToDto),
    cashback: {
      balanceCents: file.cashback.balanceCents,
      entries: file.cashback.entries.map((entry) => ({
        id: entry.id,
        bookingId: entry.bookingId,
        type: entry.type,
        amountCents: Number(entry.amountCents),
        availableFrom: entry.availableFrom ? formatIsoDate(entry.availableFrom) : null,
        expiresAt: entry.expiresAt ? formatIsoDate(entry.expiresAt) : null,
      })),
    },
  };
}

function expeditionToDto(trip: CustomerFileExpedition): ExpeditionDto {
  return {
    bookingId: trip.bookingId,
    groupId: trip.groupId,
    groupName: trip.groupName,
    startDate: formatIsoDate(trip.startDate),
    endDate: formatIsoDate(trip.endDate),
    status: trip.status,
    role: trip.role,
    participantCount: trip.participantCount,
    contractedCents: trip.contractedCents,
    receivedCents: trip.receivedCents,
    dueCents: trip.dueCents,
    checkedInAt: trip.checkedInAt ? trip.checkedInAt.toISOString() : null,
  };
}

function formatIsoDate(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}
