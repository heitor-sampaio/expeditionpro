import {
  createAutomation,
  deleteAutomation,
  getAutomation,
  getAutomationRunSteps,
  listAutomationRuns,
  listAutomations,
  renameAutomation,
  saveAutomationGraph,
  setAutomationEnabled,
  requireTeamAdmin,
} from '@expedition/application';
import { z } from 'zod';
import type { AutomationRunRecord, AutomationRecord, RunStepRecord } from '@expedition/application';
import type { Port } from '@expedition/domain';
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

/**
 * O grafo é validado de verdade no domínio. Aqui só se garante que é a **forma** de um grafo:
 * duplicar as dez regras em Zod seria manter a mesma decisão em dois lugares.
 */
const graph = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum([
        'trigger',
        'condition',
        'switch',
        'forEach',
        'lookup',
        'setVariable',
        'delay',
        'action',
        'end',
      ]),
      type: z.string().min(1),
      config: z.record(z.string(), z.unknown()),
      position: z.object({ x: z.number(), y: z.number() }),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string().min(1),
      from: z.string().min(1),
      /*
       * AU-15: a saída da escolha múltipla carrega o id do caso, então a lista não é fechada.
       * O formato é conferido aqui e vira `Port` na saída do parse — depois da borda o tipo é
       * verdade. Se a porta existe **naquele bloco** é outra pergunta, e quem responde é o
       * domínio, com o nome do problema junto.
       */
      port: z
        .string()
        .regex(/^(next|true|false|default|case_[\w-]+)$/)
        .transform((valor) => valor as Port),
      to: z.string().min(1),
    }),
  ),
});

export function registerAutomationRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
  runner: { tick(now: Date): Promise<number> },
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const automacoes = () => ({ automations: deps.automations, audit: deps.audit });
  const params = z.object({ automationId: z.string().min(1) });
  const leitura = () => ({
    automations: deps.automations,
    audit: deps.audit,
    runs: deps.automationRuns,
    steps: deps.automationRunSteps,
  });

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
        // AU-14: só o nome. O gatilho é um bloco, e chega com o desenho.
        body: z.object({ name: z.string().trim().min(1), description: z.string().optional() }),
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
    {
      schema: {
        params,
        body: z.object({
          enabled: z.boolean(),
          // AU-13: a tela manda isto depois de mostrar, em texto, o que a automação vai
          // fazer sozinha com dinheiro.
          confirmMoneyActions: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const atualizada = await setAutomationEnabled(automacoes(), ctx, {
        automationId: request.params.automationId,
        ...request.body,
      });
      return reply.send(toDto(atualizada));
    },
  );

  // AU-06 — o log: "por que essa mensagem foi enviada para esse cliente?".
  typed.get(
    '/v1/automations/:automationId/runs',
    { schema: { params } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const rows = await listAutomationRuns(leitura(), ctx, {
        automationId: request.params.automationId,
      });
      return reply.send(rows.map(toRunDto));
    },
  );

  typed.get(
    '/v1/automation-runs/:runId',
    { schema: { params: z.object({ runId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const { run, steps } = await getAutomationRunSteps(leitura(), ctx, {
        runId: request.params.runId,
      });
      return reply.send({ ...toRunDto(run), steps: steps.map(toStepDto) });
    },
  );

  /*
   * AU-04 — uma passada manual do motor, para a equipe destravar sem esperar a varredura de
   * um minuto. Owner e admin só: é o mesmo poder de fazer a automação agir agora.
   */
  typed.post('/v1/automations/tick', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    requireTeamAdmin(ctx, 'rodar o motor de automações');
    return reply.send({ executadas: await runner.tick(new Date()) });
  });

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
    triggerConfig: automation.triggerConfig,
    graph: automation.graph,
    enabled: automation.enabled,
    runAsUserId: automation.runAsUserId,
    createdAt: automation.createdAt.toISOString(),
    updatedAt: automation.updatedAt.toISOString(),
  };
}

/** AU-06 — a execução como a tela a mostra. Sem `variables`: elas guardam dado do cliente. */
function toRunDto(run: AutomationRunRecord) {
  return {
    id: run.id,
    automationId: run.automationId,
    status: run.status,
    currentNodeId: run.currentNodeId,
    triggerRef: run.triggerRef,
    stepsTaken: run.stepsTaken,
    attempts: run.attempts,
    lastError: run.lastError,
    wakeAt: run.wakeAt.toISOString(),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function toStepDto(step: RunStepRecord) {
  return {
    id: step.id,
    nodeId: step.nodeId,
    kind: step.kind,
    outcome: step.outcome,
    detail: step.detail,
    at: step.at.toISOString(),
  };
}
