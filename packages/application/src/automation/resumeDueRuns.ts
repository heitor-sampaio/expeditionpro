import { advanceAutomationRun } from './advanceAutomationRun.js';
import type { AutomationRunnerDeps } from './runnerDeps.js';

/**
 * Quanto tempo uma execução pode ficar reivindicada antes de voltar para a fila. É o que
 * recupera o trabalho de um processo que morreu no meio — num deploy, por exemplo.
 */
const ABANDONADA_APOS_MS = 5 * 60_000;

export interface ResumeDueRunsCommand {
  /** Quem está reivindicando. Dois processos com o mesmo nome disputariam as mesmas linhas. */
  readonly workerId: string;
  readonly now: Date;
  /** O lote. É o que transforma duzentas saídas vencidas numa fila que drena, e não em
   * duzentas mensagens no mesmo segundo. */
  readonly limit: number;
}

/**
 * AU-04 — a passada do motor.
 *
 * Reivindica um lote do que está vencido e anda por cada execução. Chamada de dois lugares: do
 * empurrão que o gatilho dá logo depois de enfileirar (é daí que vem a reação em
 * milissegundos), e da varredura periódica, que é só a rede de segurança — espera que venceu,
 * gatilho temporal, e execução órfã de um processo que caiu.
 *
 * Uma execução que falha **não interrompe as outras**: cada uma é um cliente diferente, e um
 * provedor fora do ar para um não é motivo para a fila inteira parar.
 */
export async function resumeDueRuns(
  deps: AutomationRunnerDeps,
  command: ResumeDueRunsCommand,
): Promise<number> {
  const lote = await deps.runs.claimDue(
    command.workerId,
    command.now,
    command.limit,
    ABANDONADA_APOS_MS,
  );

  let feitas = 0;
  for (const ref of lote) {
    await advanceAutomationRun(deps, ref, command.now);
    feitas += 1;
  }
  return feitas;
}
