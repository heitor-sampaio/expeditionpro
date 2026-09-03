import { requireTeam } from '../audience.js';
import { exigir } from './getAutomation.js';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type {
  AutomationRunRecord,
  AutomationRunRepository,
  AutomationRunStepRepository,
  RunStepRecord,
} from './automationRunRepository.js';

export interface AutomationRunReadDeps extends AutomationDeps {
  readonly runs: AutomationRunRepository;
  readonly steps: AutomationRunStepRepository;
}

/** Quantas execuções a tela mostra. O log serve para diagnosticar o recente, não para auditar. */
const LIMITE = 50;

/**
 * AU-06 — as execuções de uma automação.
 *
 * `operator` lê, como lê a lista: quem atende precisa saber o que o sistema respondeu sozinho
 * antes de responder por cima. Cliente não chega aqui (AU-10) — o log nomeia decisões tomadas
 * a respeito dele.
 */
export async function listAutomationRuns(
  deps: AutomationRunReadDeps,
  ctx: RequestContext,
  query: { automationId: string },
): Promise<AutomationRunRecord[]> {
  requireTeam(ctx);
  await exigir(deps, ctx, query.automationId);
  return deps.runs.listByAutomation(ctx.tenantId, query.automationId, LIMITE);
}

/**
 * AU-06 — o passo a passo de uma execução: qual nó, o que decidiu, o que fez, o que o provedor
 * respondeu. É o que responde "por que essa mensagem foi enviada para esse cliente?".
 */
export async function getAutomationRunSteps(
  deps: AutomationRunReadDeps,
  ctx: RequestContext,
  query: { runId: string },
): Promise<{ run: AutomationRunRecord; steps: RunStepRecord[] }> {
  requireTeam(ctx);

  const run = await deps.runs.findById(ctx.tenantId, query.runId);
  // Execução de outro tenant responde como se não existisse: 404 onde 403 confirmaria.
  if (run === null) throw new NotFoundError('execução');

  return { run, steps: await deps.steps.listByRun(ctx.tenantId, query.runId) };
}
