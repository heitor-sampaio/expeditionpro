import {
  archiveStage,
  createOpportunity,
  createStage,
  getOpportunityBoard,
  moveOpportunity,
  renameStage,
  reorderStages,
  setOpportunityItinerary,
} from '@expedition/application';
import { cents, formatPhone } from '@expedition/domain';
import { z } from 'zod';
import type { BoardColumn, OpportunityRecord } from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * §5.16 — o funil de oportunidades.
 *
 * A borda faz o que faz no resto do projeto: valida com Zod e traduz para DTO. Nenhuma regra
 * mora aqui — recusar ganho arrastado, exigir motivo de perda e bloquear etapa em uso são do
 * caso de uso, e é lá que estão testadas.
 */
export function registerCrmRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  const stageKind = z.enum(['open', 'won', 'lost']);
  const opportunityBody = z.object({
    contactName: z.string().trim().min(1),
    phone: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    itineraryId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    expectedValueCents: z.number().int().nonnegative().optional(),
    source: z.enum(['manual', 'whatsapp', 'instagram', 'messenger', 'site']).optional(),
  });

  const crm = () => ({ opportunities: deps.opportunities, audit: deps.audit });

  typed.get('/v1/crm/board', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const colunas = await getOpportunityBoard({ opportunities: deps.opportunities }, ctx);
    return reply.send(colunas.map(columnDto));
  });

  typed.post(
    '/v1/crm/opportunities',
    { schema: { body: opportunityBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const { expectedValueCents, ...resto } = request.body;
      const criada = await createOpportunity(crm(), ctx, {
        ...resto,
        ...(expectedValueCents === undefined
          ? {}
          : { expectedValueCents: cents(expectedValueCents) }),
      });
      return reply.status(201).send(opportunityDto(criada));
    },
  );

  typed.patch(
    '/v1/crm/opportunities/:opportunityId/stage',
    {
      schema: {
        params: z.object({ opportunityId: z.string().min(1) }),
        body: z.object({
          stageId: z.string().min(1),
          lostReason: z.string().trim().min(1).optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const movida = await moveOpportunity(crm(), ctx, {
        opportunityId: request.params.opportunityId,
        ...request.body,
      });
      return reply.send(opportunityDto(movida));
    },
  );

  // OP-03: de qual roteiro é a conversa. Rota própria, como o /stage — são as duas coisas
  // que se mexem num cartão pelo quadro, e cada uma tem regra própria.
  typed.patch(
    '/v1/crm/opportunities/:opportunityId/itinerary',
    {
      schema: {
        params: z.object({ opportunityId: z.string().min(1) }),
        body: z.object({ itineraryId: z.string().min(1).nullable() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const atualizada = await setOpportunityItinerary(
        { opportunities: deps.opportunities, audit: deps.audit, itineraries: deps.itineraries },
        ctx,
        { opportunityId: request.params.opportunityId, itineraryId: request.body.itineraryId },
      );
      return reply.send(opportunityDto(atualizada));
    },
  );

  typed.post(
    '/v1/crm/stages',
    { schema: { body: z.object({ name: z.string().trim().min(1), kind: stageKind }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const etapa = await createStage(crm(), ctx, request.body);
      return reply.status(201).send(stageDto(etapa));
    },
  );

  typed.patch(
    '/v1/crm/stages/:stageId',
    {
      schema: {
        params: z.object({ stageId: z.string().min(1) }),
        body: z.object({ name: z.string().trim().min(1) }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const etapa = await renameStage(crm(), ctx, {
        stageId: request.params.stageId,
        name: request.body.name,
      });
      return reply.send(stageDto(etapa));
    },
  );

  // A ordem é do funil inteiro, não de uma etapa — por isso `POST` num recurso de coleção e
  // não `PATCH` numa etapa. Ver `reorderStages`: lista parcial deixaria a ordem com buraco.
  typed.post(
    '/v1/crm/stages/reorder',
    { schema: { body: z.object({ orderedStageIds: z.array(z.string().min(1)).min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await reorderStages(crm(), ctx, { orderedStageIds: request.body.orderedStageIds });
      return reply.status(204).send();
    },
  );

  // `DELETE` porque é o que a etapa faz do ponto de vista de quem usa: sai do quadro. No
  // banco é arquivamento, para a trilha não ficar apontando para nada (OP-06).
  typed.delete(
    '/v1/crm/stages/:stageId',
    { schema: { params: z.object({ stageId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await archiveStage(crm(), ctx, { stageId: request.params.stageId });
      return reply.status(204).send();
    },
  );
}

function columnDto(coluna: BoardColumn) {
  return {
    stage: stageDto(coluna.stage),
    opportunities: coluna.opportunities.map(opportunityDto),
    /*
     * OP-09 — previsão, não caixa. O nome do campo diz isso e a tela é obrigada a repetir:
     * somar este número a valor recebido ou contratado (§3.6) misturaria aposta com fato.
     */
    expectedValueCents: coluna.expectedValueCents,
  };
}

function stageDto(stage: { id: string; name: string; position: number; kind: string }) {
  return { id: stage.id, name: stage.name, position: stage.position, kind: stage.kind };
}

function opportunityDto(opportunity: OpportunityRecord) {
  return {
    id: opportunity.id,
    stageId: opportunity.stageId,
    contactName: opportunity.contactName,
    // Guardado em E.164, devolvido formatado: a equipe liga a partir da tela. O funil é só
    // da equipe (OP-11), então não há o que mascarar.
    phone: opportunity.phone === null ? null : formatPhone(opportunity.phone),
    email: opportunity.email,
    itineraryId: opportunity.itineraryId,
    customerId: opportunity.customerId,
    bookingId: opportunity.bookingId,
    expectedValueCents:
      opportunity.expectedValueCents === null ? null : Number(opportunity.expectedValueCents),
    source: opportunity.source,
    lostReason: opportunity.lostReason,
    createdAt: opportunity.createdAt.toISOString(),
  };
}
