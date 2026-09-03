import { actorUserId } from '../audit/auditLogRepository.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import { exigir } from './getAutomation.js';
import { assertGrafoValido } from './saveAutomationGraph.js';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type { AutomationRecord } from './automationRepository.js';
import type { AutomationGraph } from '@expedition/domain';
import { BusinessRuleError } from '../errors.js';

export interface SetAutomationEnabledCommand {
  readonly automationId: string;
  readonly enabled: boolean;
  /** AU-13: a confirmação à parte, exigida só quando o fluxo toca dinheiro. */
  readonly confirmMoneyActions?: boolean | undefined;
}

/**
 * AU-13 — as ações que mexem no financeiro.
 *
 * Confirmar inscrição ocupa vaga e faz a receita entrar no relatório. Uma pessoa fazendo isso
 * na tela vê o que está fazendo; uma automação fazendo trinta vezes de madrugada não tem esse
 * momento — a confirmação à parte é onde ele é reposto.
 */
const ACOES_DE_DINHEIRO = new Set(['confirm_booking', 'create_charge']);

/** Os nomes das ações de dinheiro presentes no desenho, para o aviso dizer quais são. */
function acoesDeDinheiro(graph: AutomationGraph): string[] {
  return [
    ...new Set(
      graph.nodes
        .filter((no) => no.kind === 'action' && ACOES_DE_DINHEIRO.has(no.type))
        .map((no) => no.type),
    ),
  ];
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
  if (command.enabled) {
    assertGrafoValido(automacao.graph);

    // AU-13: desligar nunca passa por aqui — parar tem que ser sempre possível.
    const dinheiro = acoesDeDinheiro(automacao.graph);
    if (dinheiro.length > 0 && command.confirmMoneyActions !== true) {
      throw new BusinessRuleError(
        'money_action_confirmation',
        `Esta automação mexe no financeiro sozinha (${dinheiro.join(', ')}). ` +
          'Confirme que é isso mesmo antes de ligar.',
      );
    }
  }

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
