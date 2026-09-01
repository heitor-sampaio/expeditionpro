import {
  allocateFromQueue,
  getIntakeDetail,
  listRecentBookings,
  createApiKey,
  discardIntake,
  listAllocationQueue,
  listApiKeys,
  listFormMappings,
  passthroughUnitOfWork,
  receiveIntake,
  removeFormMapping,
  reprocessIntake,
  revokeApiKey,
  setFormMapping,
} from '@expedition/application';
import { formatCpf } from '@expedition/domain';
import { z } from 'zod';
import type {
  AllocationQueueItem,
  ApiKeyRecord,
  EnrichedFormMapping,
} from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';
import { fireBookingNotification } from './notify.js';

/**
 * Webhook de inscrições (§5.7). `POST /v1/intake/:tenantSlug` autentica pela API key
 * (header `api_token`), grava e enfileira: `202 queued` / `200 duplicate` / `401` /
 * `422 validation_failed`. `GET /v1/intake` serve a fila de alocação (equipe).
 * O corpo é arbitrário (formato do formulário) — quem valida é o perfil de mapeamento.
 */
export function registerIntakeRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/v1/intake/:tenantSlug',
    {
      schema: { params: z.object({ tenantSlug: z.string().min(1) }) },
      // SEC-14/IN-23: rate limit do webhook **por chave** (não por IP) — uma integração
      // barulhenta não afeta as outras. Sem token, cai no IP para conter martelada anônima.
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: (request) =>
            (request.headers['api_token'] as string | undefined) ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const token = request.headers['api_token'] as string | undefined;
      const source = (request.headers['x-intake-source'] as string | undefined) ?? 'wp_flat_v1';
      const result = await receiveIntake(
        { apiKeys: deps.apiKeys, intake: deps.intake, formMappings: deps.formMappings },
        { tenantSlug: request.params.tenantSlug, token, source, rawBody: request.body },
      );
      const code = result.status === 'duplicate' ? 200 : 202;
      return reply.status(code).send({ intake_id: result.intakeId, status: result.status });
    },
  );

  typed.get('/v1/intake', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listAllocationQueue(
      { intake: deps.intake, schedule: deps.schedule, clock: deps.clock },
      ctx,
    );
    return reply.send(rows.map(queueDto));
  });

  // IN-17c — detalhe do item da fila: pessoas, idades na data da saída, valor, cadastro
  typed.get(
    '/v1/intake/:intakeId',
    {
      schema: {
        params: z.object({ intakeId: z.string().min(1) }),
        querystring: z.object({ groupId: z.string().optional() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const detail = await getIntakeDetail(
        {
          intake: deps.intake,
          customers: deps.customers,
          cashback: deps.cashback,
          schedule: deps.schedule,
          itineraries: deps.itineraries,
        },
        ctx,
        { intakeId: request.params.intakeId, groupId: request.query.groupId },
      );
      return reply.send({
        id: detail.id,
        source: detail.source,
        status: detail.status,
        chosenGroupId: detail.chosenGroupId,
        responsible: {
          ...personDto(detail.responsible),
          email: detail.responsible.email,
          phoneDigits: detail.responsible.phoneDigits,
          phoneDisplay: detail.responsible.phoneDisplay,
          existingCustomerId: detail.responsible.existingCustomerId,
          cashbackBalanceCents: detail.responsible.cashbackBalanceCents,
        },
        companions: detail.companions.map(personDto),
        quote: detail.quote
          ? {
              groupId: detail.quote.groupId,
              groupName: detail.quote.groupName,
              startDate: isoOf(detail.quote.startDate),
              endDate: isoOf(detail.quote.endDate),
              totalCents: detail.quote.totalCents,
            }
          : null,
      });
    },
  );

  // IN-17b — as últimas inscrições que entraram, de qualquer origem
  typed.get(
    '/v1/bookings/recent',
    {
      schema: {
        querystring: z.object({ limit: z.coerce.number().int().positive().max(100).optional() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const rows = await listRecentBookings(
        { bookings: deps.bookings, schedule: deps.schedule, customers: deps.customers },
        ctx,
        { limit: request.query.limit },
      );
      return reply.send(
        rows.map((row) => ({
          bookingId: row.bookingId,
          groupId: row.groupId,
          groupName: row.groupName,
          startDate: isoOf(row.startDate),
          endDate: isoOf(row.endDate),
          responsibleCustomerId: row.responsibleCustomerId,
          responsibleName: row.responsibleName,
          status: row.status,
          source: row.source,
          participantCount: row.participantCount,
          contractedCents: row.contractedCents,
        })),
      );
    },
  );

  typed.post(
    '/v1/intake/:intakeId/allocate',
    {
      schema: {
        params: z.object({ intakeId: z.string().min(1) }),
        body: z.object({ groupId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      // §5.7.2: em produção `deps.uow` abre uma transação única; sem ela (dev/in-memory),
      // o passthrough roda os repos como estão — sem atomicidade, que ali não há o que
      // coordenar.
      const uow =
        deps.uow ??
        passthroughUnitOfWork({
          intake: deps.intake,
          customers: deps.customers,
          bookings: deps.bookings,
          schedule: deps.schedule,
          itineraries: deps.itineraries,
          cashback: deps.cashback,
          documents: deps.documents,
          identityRequests: deps.identityRequests,
        });
      const result = await allocateFromQueue(
        { uow, clock: deps.clock ?? (() => new Date()), tenants: deps.tenants },
        ctx,
        { intakeId: request.params.intakeId, groupId: request.body.groupId },
      );
      await fireBookingNotification(deps, request.log, ctx, result.bookingId, 'received');
      return reply.status(201).send(result);
    },
  );

  typed.post(
    '/v1/intake/:intakeId/reprocess',
    { schema: { params: z.object({ intakeId: z.string().min(1) }) } },
    async (request, reply) => {
      // IN-05: reaplica o perfil ao payload preservado. Sucesso → volta à fila (200);
      // ainda inválido → o handler de erro devolve 422 com o campo culpado.
      const ctx = await deps.resolveContext(request);
      const result = await reprocessIntake({ intake: deps.intake }, ctx, {
        intakeId: request.params.intakeId,
      });
      return reply.status(200).send(result);
    },
  );

  typed.post(
    '/v1/intake/:intakeId/discard',
    {
      schema: {
        params: z.object({ intakeId: z.string().min(1) }),
        body: z.object({ reason: z.string().trim().min(1) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await discardIntake({ intake: deps.intake }, ctx, {
        intakeId: request.params.intakeId,
        reason: request.body.reason,
      });
      return reply.status(204).send();
    },
  );

  typed.post(
    '/v1/api-keys',
    {
      schema: {
        body: z.object({
          name: z.string().trim().min(1),
          scopes: z.array(z.string().min(1)).optional(),
          environment: z.enum(['live', 'test']).optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const created = await createApiKey(
        { apiKeys: deps.apiKeys, audit: deps.audit },
        ctx,
        request.body,
      );
      // o token completo aparece SÓ aqui (§3.9)
      return reply.status(201).send({ token: created.token, key: keyDto(created.record) });
    },
  );

  typed.get('/v1/api-keys', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listApiKeys({ apiKeys: deps.apiKeys }, ctx);
    return reply.send(rows.map(keyDto));
  });

  typed.delete(
    '/v1/api-keys/:keyId',
    { schema: { params: z.object({ keyId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await revokeApiKey({ apiKeys: deps.apiKeys, audit: deps.audit }, ctx, {
        keyId: request.params.keyId,
      });
      return reply.status(204).send();
    },
  );

  // IN-20: mapa form_id→roteiro (Configurações → Integrações). Equipe lista; owner/admin
  // grava e remove. O upsert é por (source, form_id), então reconfigurar não duplica.
  typed.get('/v1/form-mappings', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listFormMappings(
      { formMappings: deps.formMappings, itineraries: deps.itineraries },
      ctx,
    );
    return reply.send(rows.map(formMappingDto));
  });

  typed.put(
    '/v1/form-mappings',
    {
      schema: {
        body: z.object({
          source: z.enum(['wp_flat_v1', 'canonical_v1']),
          formId: z.string().trim().min(1),
          itineraryId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const created = await setFormMapping(
        { formMappings: deps.formMappings, itineraries: deps.itineraries },
        ctx,
        request.body,
      );
      return reply.status(200).send({
        id: created.id,
        source: created.source,
        formId: created.formId,
        itineraryId: created.itineraryId,
      });
    },
  );

  typed.delete(
    '/v1/form-mappings/:id',
    { schema: { params: z.object({ id: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await removeFormMapping({ formMappings: deps.formMappings }, ctx, { id: request.params.id });
      return reply.status(204).send();
    },
  );
}

function formMappingDto(row: EnrichedFormMapping) {
  return {
    id: row.mapping.id,
    source: row.mapping.source,
    formId: row.mapping.formId,
    itineraryId: row.mapping.itineraryId,
    itineraryName: row.itineraryName,
  };
}

function keyDto(key: ApiKeyRecord) {
  return {
    id: key.id,
    name: key.name,
    masked: `${key.prefix}••••`,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    useCount: key.useCount,
    revoked: key.revokedAt !== null,
  };
}

function queueDto(item: AllocationQueueItem) {
  return {
    id: item.id,
    externalId: item.externalId,
    formId: item.formId,
    status: item.status,
    responsibleName: item.responsibleName,
    responsibleCpf: item.responsibleCpf,
    companionCount: item.companionCount,
    desiredDate: item.desiredDate,
    receivedAt: item.receivedAt,
    warnings: item.warnings,
    error: item.error,
    itineraryId: item.itineraryId,
    suggestedGroupId: item.suggestedGroupId,
    suggestedGroupName: item.suggestedGroupName,
    source: item.source,
    chosenGroupId: item.chosenGroupId,
  };
}

function isoOf(date: { year: number; month: number; day: number }): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

/** CPF completo no back-office (decisão do dono do produto); idade só com saída escolhida. */
function personDto(person: {
  fullName: string;
  cpf: string;
  birthDate: { year: number; month: number; day: number };
  age: number | null;
  band: string | null;
}) {
  return {
    fullName: person.fullName,
    cpf: formatCpf(person.cpf as never),
    birthDate: isoOf(person.birthDate),
    age: person.age,
    band: person.band,
  };
}
