import { actorUserId } from '../audit/auditLogRepository.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import { BusinessRuleError } from '../errors.js';
import { exigir } from './getAutomation.js';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type { AutomationRef } from './getAutomation.js';

/**
 * §5.18 — apaga a automação, **logicamente**.
 *
 * O que ela já fez deixou rastro em conversa e em ficha de cliente. Apagar a linha tiraria o
 * "por quê" de coisas que aconteceram — e a pergunta "quem mandou essa mensagem?" continua
 * valendo depois que a automação sai da tela.
 *
 * Automação ligada não se apaga: desligar primeiro é o ato que separa "não uso mais" de "some
 * com isso agora", e evita a exclusão feita no impulso enquanto ela ainda responde a clientes.
 */
export async function deleteAutomation(
  deps: AutomationDeps,
  ctx: RequestContext,
  command: AutomationRef,
): Promise<void> {
  requireTeamAdmin(ctx, 'apagar automação');

  const automacao = await exigir(deps, ctx, command.automationId);
  if (automacao.enabled) {
    throw new BusinessRuleError(
      'automation_enabled',
      'Desligue a automação antes de apagar: ela está agindo sobre clientes agora.',
    );
  }

  await deps.automations.softDelete(ctx.tenantId, automacao.id);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'automation',
    entityId: automacao.id,
    action: 'automation.delete',
    diff: { name: automacao.name },
  });
}
