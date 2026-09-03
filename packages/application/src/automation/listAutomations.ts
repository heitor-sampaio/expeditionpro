import { requireTeam } from '../audience.js';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type { AutomationRecord } from './automationRepository.js';

/**
 * AU-10 — quais automações existem.
 *
 * `requireTeam` e não `requireTeamAdmin`: quem atende precisa saber o que responde sozinho.
 * Ver uma automação ligada explica por que uma mensagem saiu sem ninguém digitar — esconder
 * isso de quem está na conversa seria esconder o sistema de quem o opera.
 */
export async function listAutomations(
  deps: AutomationDeps,
  ctx: RequestContext,
): Promise<AutomationRecord[]> {
  requireTeam(ctx);
  return deps.automations.list(ctx.tenantId);
}
