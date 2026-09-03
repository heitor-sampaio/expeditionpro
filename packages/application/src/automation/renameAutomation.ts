import { actorUserId } from '../audit/auditLogRepository.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import { BusinessRuleError, RequiredFieldError } from '../errors.js';
import { exigir } from './getAutomation.js';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type { AutomationRecord } from './automationRepository.js';

export interface RenameAutomationCommand {
  readonly automationId: string;
  readonly name: string;
  readonly description?: string | undefined;
}

/** §5.18 — troca o nome e a descrição. Vale com a automação ligada: não muda o que ela faz. */
export async function renameAutomation(
  deps: AutomationDeps,
  ctx: RequestContext,
  command: RenameAutomationCommand,
): Promise<AutomationRecord> {
  requireTeamAdmin(ctx, 'renomear automação');

  const automacao = await exigir(deps, ctx, command.automationId);
  const name = command.name.trim();
  if (name === '') throw new RequiredFieldError('nome da automação');

  const repetido = await deps.automations.findByName(ctx.tenantId, name);
  if (repetido && repetido.id !== automacao.id) {
    throw new BusinessRuleError('duplicate_automation', 'Já existe uma automação com esse nome.');
  }

  const atualizada = await deps.automations.update(ctx.tenantId, automacao.id, {
    name,
    ...(command.description === undefined
      ? {}
      : { description: command.description.trim() || null }),
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'automation',
    entityId: automacao.id,
    action: 'automation.rename',
    diff: { from: automacao.name, to: name },
  });

  return atualizada;
}
