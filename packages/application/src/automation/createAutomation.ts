import { actorUserId } from '../audit/auditLogRepository.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import { BusinessRuleError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type { AutomationRecord, TriggerType } from './automationRepository.js';

export interface CreateAutomationCommand {
  readonly name: string;
  readonly description?: string | undefined;
  readonly triggerType: TriggerType;
  /** AU-12: `{ offsetDays }` no gatilho temporal. Vazio nos de evento. */
  readonly triggerConfig?: Record<string, unknown> | undefined;
}

/**
 * AU-01 · AU-02 — cria a automação já com o gatilho no quadro, e desligada.
 *
 * Exige owner ou admin porque automação age com o poder de quem a liga (AU-03): deixar
 * `operator` criar seria deixá-lo escrever a própria procuração.
 *
 * O grafo nasce com o bloco de gatilho já posto. Quadro em branco não diz por onde começar, e
 * o gatilho é o único bloco que toda automação tem por definição.
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
    triggerType: command.triggerType,
    triggerConfig: command.triggerConfig ?? {},
    graph: {
      nodes: [
        {
          id: 'trigger',
          kind: 'trigger',
          type: command.triggerType,
          config: {},
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    },
    createdBy: actorUserId(ctx.actor),
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'automation',
    entityId: criada.id,
    action: 'automation.create',
    diff: { name, triggerType: command.triggerType },
  });

  return criada;
}
