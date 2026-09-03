import { requireTeam } from '../audience.js';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type { AutomationRecord } from './automationRepository.js';

export interface AutomationRef {
  readonly automationId: string;
}

/** AU-10 — abre uma automação para ler ou editar o desenho. */
export async function getAutomation(
  deps: AutomationDeps,
  ctx: RequestContext,
  command: AutomationRef,
): Promise<AutomationRecord> {
  requireTeam(ctx);
  return exigir(deps, ctx, command.automationId);
}

/**
 * Compartilhado pelos casos de uso que mexem numa automação existente. Automação de outro
 * tenant e inexistente respondem igual: o repositório já é escopado, e distinguir confirmaria
 * que o id existe em algum lugar.
 */
export async function exigir(
  deps: AutomationDeps,
  ctx: RequestContext,
  automationId: string,
): Promise<AutomationRecord> {
  const automacao = await deps.automations.findById(ctx.tenantId, automationId);
  if (!automacao) throw new NotFoundError('automação');
  return automacao;
}
