import { janelaDe } from '@expedition/domain';
import { enqueueAutomationRun } from './enqueueAutomationRun.js';
import type { AutomationRunnerDeps } from './runnerDeps.js';

export interface ScanRecurringTriggersCommand {
  /** O instante da passada. Entra como parâmetro: varredura não lê relógio por dentro. */
  readonly now: Date;
}

/**
 * AU-17 — o gatilho que roda de tempos em tempos.
 *
 * Varre, como o temporal (AU-12), e pela mesma razão: despertador marcado para as 6:00 perde
 * o disparo se o processo estiver reiniciando, e "em que fatia de tempo estamos?" continua
 * verdadeiro às 6:05.
 *
 * **A fatia é o que impede o disparo múltiplo.** A varredura passa de sessenta em sessenta
 * segundos; sem ela, "a cada seis horas" abriria uma execução por passada. Dividir o tempo em
 * fatias do tamanho do intervalo e usar a fatia como chave de idempotência resolve sem
 * guardar estado — e sem estado não há o que corromper num restauro de banco nem o que
 * perder num deploy.
 */
export async function scanRecurringTriggers(
  deps: AutomationRunnerDeps,
  command: ScanRecurringTriggersCommand,
): Promise<number> {
  const temporais = await deps.automations.listTimeTriggersAcrossTenants();
  let abertas = 0;

  for (const alvo of temporais) {
    if (alvo.triggerType !== 'recurring') continue;

    const criadas = await enqueueAutomationRun(deps, {
      tenantId: alvo.tenantId,
      triggerType: 'recurring',
      triggerRef: { automationId: alvo.automationId },
      variables: { agora: relogio(command.now) },
      // A fatia entra na chave; a unique `(tenant, automação, chave)` deixa passar a primeira
      // varredura de cada intervalo e barra as seguintes.
      idempotencyKey: `recurring:${String(janelaDe(alvo.triggerConfig, command.now))}`,
      now: command.now,
    });
    abertas += criadas.length;
  }

  return abertas;
}

/**
 * A data e a hora como o contexto as promete (AU-16), no fuso da operação.
 *
 * A expedição é no Brasil e o servidor roda em UTC: sem o deslocamento, uma automação das
 * 21:00 anunciaria a data de amanhã para quem está lendo hoje.
 */
function relogio(now: Date): { data: string; hora: string } {
  const local = new Date(now.getTime() - 3 * 3_600_000).toISOString();
  return { data: local.slice(0, 10), hora: local.slice(11, 16) };
}
