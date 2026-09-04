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
  /**
   * AU-05 — quantos lotes uma passada pode encadear antes de devolver o processo.
   *
   * A fila **não recusa** trabalho: o que não coube numa passada fica pendente e a seguinte o
   * pega. Este número existe pelo outro lado do problema — um processo preso numa fila de mil
   * execuções não faria a varredura seguinte, não responderia ao empurrão de um gatilho novo, e
   * um deploy no meio disso deixaria tudo carimbado esperando o prazo de abandono.
   */
  readonly maxBatches?: number;
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
  const maxLotes = Math.max(command.maxBatches ?? 1, 1);
  let feitas = 0;

  for (let volta = 0; volta < maxLotes; volta += 1) {
    const lote = await deps.runs.claimDue(
      command.workerId,
      command.now,
      command.limit,
      ABANDONADA_APOS_MS,
    );
    if (lote.length === 0) break;

    for (const ref of lote) {
      await advanceAutomationRun(deps, ref, command.now);
      feitas += 1;
    }

    // Lote incompleto quer dizer fila seca: parar aqui poupa uma reivindicação inútil.
    if (lote.length < command.limit) break;
  }

  return feitas;
}
