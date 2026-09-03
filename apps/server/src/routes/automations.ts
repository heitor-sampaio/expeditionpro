import {
  createAutomation,
  deleteAutomation,
  getAutomation,
  listAutomations,
  renameAutomation,
  saveAutomationGraph,
  setAutomationEnabled,
} from '@expedition/application';
import { z } from 'zod';
import type { AutomationRecord } from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * §5.18 — as automações pelo HTTP.
 *
 * A borda faz o que faz no resto do projeto: valida com Zod e traduz para DTO. Nenhuma regra
 * mora aqui — recusar grafo torto, exigir owner para ligar e impedir edição do que está ligado
 * são do caso de uso, e é lá que estão testadas.
 */

const triggerType = z.enum([
  'message_received',
  'conversation_created',
  'opportunity_created',
  'opportunity_moved',
  'booking_created',
  'booking_confirmed',
  'payment_registered',
]);

/**
 * O grafo é validado de verdade no domínio. Aqui só se garante que é a **forma** de um grafo:
 * duplicar as oito regras em Zod seria manter a mesma decisão em dois lugares.
 */
const graph = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum(['trigger', 'condition', 'setVariable', 'delay', 'action', 'end']),
      type: z.string().min(1),
      config: z.record(z.string(), z.unknown()),
      position: z.object({ x: z.number(), y: z.number() }),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string().min(1),
      from: z.string().min(1),
      port: z.enum(['next', 'true', 'false']),
      to: z.string().min(1),
    }),
  ),
});

export function registerAutomationRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const automacoes = () => ({ automations: deps.automations, audit: deps.audit });
  const params = z.object({ automationId: z.string().min(1) });

  typed.get('/v1/automations', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listAutomations(automacoes(), ctx);
    return reply.send(rows.map(toDto));
  });

  typed.get('/v1/automations/:automationId', { schema: { params } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const automacao = await getAutomation(automacoes(), ctx, {
      automationId: request.params.automationId,
    });
    return reply.send(toDto(automacao));
  });

  typed.post(
    '/v1/automations',
    {
      schema: {
        body: z.object({
          name: z.string().trim().min(1),
          description: z.string().optional(),
          triggerType,
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const criada = await createAutomation(automacoes(), ctx, request.body);
      return reply.status(201).send(toDto(criada));
    },
  );

  typed.patch(
    '/v1/automations/:automationId',
    {
      schema: {
        params,
        body: z.object({ name: z.string().trim().min(1), description: z.string().optional() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const atualizada = await renameAutomation(automacoes(), ctx, {
        automationId: request.params.automationId,
        ...request.body,
      });
      return reply.send(toDto(atualizada));
    },
  );

  typed.put(
    '/v1/automations/:automationId/graph',
    { schema: { params, body: z.object({ graph }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const salva = await saveAutomationGraph(automacoes(), ctx, {
        automationId: request.params.automationId,
        graph: request.body.graph,
      });
      return reply.send(toDto(salva));
    },
  );

  // AU-02 — ligar é o momento em que a automação passa a agir sobre gente de verdade.
  typed.put(
    '/v1/automations/:automationId/enabled',
    { schema: { params, body: z.object({ enabled: z.boolean() }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const atualizada = await setAutomationEnabled(automacoes(), ctx, {
        automationId: request.params.automationId,
        enabled: request.body.enabled,
      });
      return reply.send(toDto(atualizada));
    },
  );

  typed.delete('/v1/automations/:automationId', { schema: { params } }, async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    await deleteAutomation(automacoes(), ctx, { automationId: request.params.automationId });
    return reply.status(204).send();
  });
}

/** Datas em ISO, como todo DTO daqui. O grafo sai como está: é o que a tela desenha. */
function toDto(automation: AutomationRecord) {
  return {
    id: automation.id,
    name: automation.name,
    description: automation.description,
    triggerType: automation.triggerType,
    graph: automation.graph,
    enabled: automation.enabled,
    runAsUserId: automation.runAsUserId,
    createdAt: automation.createdAt.toISOString(),
    updatedAt: automation.updatedAt.toISOString(),
  };
}
