import { actorUserId } from '../audit/auditLogRepository.js';
import { requireTeamAdmin } from '../team/teamGuards.js';
import { exigir } from './getAutomation.js';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type { AutomationRecord } from './automationRepository.js';

export interface DuplicateAutomationCommand {
  readonly automationId: string;
}

/**
 * AU-26 — duplicar uma automação.
 *
 * Um fluxo que funciona é o ponto de partida do próximo: mudar o roteiro, trocar a etapa,
 * ajustar o texto. Redesenhar quinze blocos à mão para isso é trabalho que ninguém revisa, e
 * é onde entra o erro de digitação que só aparece com o cliente já do outro lado.
 *
 * **A cópia nasce desligada**, pelo mesmo motivo que toda automação nasce (AU-02): ligar é ato
 * explícito, e uma cópia que já sai agindo seria a automação mais fácil de esquecer ligada.
 */
export async function duplicateAutomation(
  deps: AutomationDeps,
  ctx: RequestContext,
  command: DuplicateAutomationCommand,
): Promise<AutomationRecord> {
  requireTeamAdmin(ctx, 'duplicar automação');

  const original = await exigir(deps, ctx, command.automationId);
  const name = await nomeLivre(deps, ctx, original.name);

  const copia = await deps.automations.create({
    tenantId: ctx.tenantId,
    name,
    description: original.description,
    graph: original.graph,
    createdBy: actorUserId(ctx.actor),
  });

  /*
   * O gatilho da cópia vem do desenho copiado, pelo mesmo caminho do salvamento (AU-14). Sem
   * isto a cópia teria o quadro certo e não reagiria a evento nenhum — uma automação que
   * parece pronta e nunca dispara é pior que uma que falha.
   */
  const atualizada = await deps.automations.update(ctx.tenantId, copia.id, {
    triggerType: original.triggerType,
    triggerConfig: original.triggerConfig,
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'automation',
    entityId: copia.id,
    action: 'automation.duplicate',
    diff: { name, from: original.id },
  });

  return atualizada;
}

/**
 * "(cópia)", depois "(cópia 2)". O nome é único por tenant, e mandar o erro de nome repetido
 * para quem só clicou em duplicar seria cobrar da pessoa uma decisão que a máquina resolve.
 */
async function nomeLivre(deps: AutomationDeps, ctx: RequestContext, base: string): Promise<string> {
  for (let n = 1; n <= TENTATIVAS_DE_NOME; n += 1) {
    const nome = n === 1 ? `${base} (cópia)` : `${base} (cópia ${String(n)})`;
    const repetido = await deps.automations.findByName(ctx.tenantId, nome);
    if (repetido === null) return nome;
  }
  // Vinte cópias do mesmo fluxo é sinal de outra coisa; o nome com a hora fecha o caso sem
  // deixar o clique falhar.
  return `${base} (cópia ${String(Date.now())})`;
}

const TENTATIVAS_DE_NOME = 20;
