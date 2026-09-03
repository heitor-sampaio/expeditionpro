import { actorUserId } from '../audit/auditLogRepository.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import { BusinessRuleError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type { AutomationRecord } from './automationRepository.js';

export interface CreateAutomationCommand {
  readonly name: string;
  readonly description?: string | undefined;
}

/**
 * AU-01 · AU-02 · AU-14 — cria a automação com o nome, e desligada.
 *
 * Exige owner ou admin porque automação age com o poder de quem a liga (AU-03): deixar
 * `operator` criar seria deixá-lo escrever a própria procuração.
 *
 * **O quadro nasce vazio, e o gatilho é um bloco como os outros.** Escolher o gatilho é a
 * primeira decisão do desenho, e ela se toma vendo o fluxo — não num formulário antes de o
 * quadro existir, que depois obrigaria a apagar tudo para trocar de ideia.
 */
export async function createAutomation(
  deps: AutomationDeps,
  ctx: RequestContext,
  command: CreateAutomationCommand,
): Promise<AutomationRecord> {
  requireTeamAdmin(ctx, 'criar automação');

  const name = command.name.trim();
  if (name === '') throw new RequiredFieldError('nome da automação');

  const repetido = await deps.automations.findByName(ctx.tenantId, name);
  if (repetido) {
    throw new BusinessRuleError(
      'duplicate_automation',
      'Já existe uma automação com esse nome. Dois nomes iguais viram engano na hora de ligar.',
    );
  }

  const criada = await deps.automations.create({
    tenantId: ctx.tenantId,
    name,
    description: command.description?.trim() || null,
    graph: { nodes: [], edges: [] },
    createdBy: actorUserId(ctx.actor),
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'automation',
    entityId: criada.id,
    action: 'automation.create',
    diff: { name },
  });

  return criada;
}
