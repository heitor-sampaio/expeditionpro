import { actorUserId } from '../audit/auditLogRepository.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import { exigir } from './getAutomation.js';
import { assertGrafoValido } from './saveAutomationGraph.js';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type { AutomationRecord } from './automationRepository.js';

export interface SetAutomationEnabledCommand {
  readonly automationId: string;
  readonly enabled: boolean;
}

/**
 * AU-02 · AU-03 — ligar e desligar.
 *
 * Ligar é o momento em que a automação passa a agir sobre gente de verdade, em escala e sem
 * ninguém olhando. Por isso três coisas acontecem aqui e em nenhum outro lugar:
 *
 * - **o desenho é conferido de novo**, porque ligar um grafo quebrado é ligar algo que falha na
 *   primeira mensagem;
 * - **fica guardado quem passa a responder por ela** (AU-03) — a automação age com o poder
 *   dessa pessoa, e o papel dela é relido a cada execução;
 * - **entra na trilha**, porque "quem ligou isso, e quando?" é pergunta que aparece depois.
 *
 * Desligar não exige desenho válido: parar tem que ser sempre possível, inclusive quando o que
 * está lá é justamente o problema.
 */
export async function setAutomationEnabled(
  deps: AutomationDeps,
  ctx: RequestContext,
  command: SetAutomationEnabledCommand,
): Promise<AutomationRecord> {
  requireTeamAdmin(ctx, 'ligar ou desligar automação');

  const automacao = await exigir(deps, ctx, command.automationId);
  if (command.enabled) assertGrafoValido(automacao.graph);

  const atualizada = await deps.automations.update(ctx.tenantId, automacao.id, {
    enabled: command.enabled,
    ...(command.enabled ? { runAsUserId: ctx.actor.userId } : {}),
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'automation',
    entityId: automacao.id,
    action: command.enabled ? 'automation.enable' : 'automation.disable',
    diff: { name: automacao.name },
  });

  return atualizada;
}
