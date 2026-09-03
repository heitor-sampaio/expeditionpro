import { randomUUID } from 'node:crypto';
import {
  enqueueAutomationRun,
  resumeDueRuns,
  scanRecurringTriggers,
  scanScheduledTriggers,
  type AutomationRunnerDeps,
  type EnqueueAutomationRunCommand,
} from '@expedition/application';
import { parseLocalDate } from '@expedition/domain';
import type { FastifyBaseLogger } from 'fastify';
import type { ServerDeps } from '../buildServer.js';
import { automationActionRegistry } from './actionRegistry.js';
import { automationFinderRegistry } from './finderRegistry.js';

/**
 * AU-04 — o motor das automações.
 *
 * O gatilho **enfileira e empurra**: grava a execução e acorda o motor no ato. A automação
 * reage em milissegundos, e quem decide o tempo dela é o bloco de espera que a equipe
 * desenhou — nunca o intervalo de uma varredura.
 *
 * A varredura periódica é só a **rede de segurança**: pega a espera que venceu, o gatilho
 * temporal, e a execução órfã de um processo que caiu no meio. Por isso ela é lenta (um
 * minuto) e barata — nada de comum depende dela.
 *
 * O desenho é durável de propósito. Um despertador perde o disparo quando o processo está
 * reiniciando; "o que está vencido?" continua verdadeiro quando ele volta. Num sistema que
 * faz deploy no meio de uma espera de três dias, é a única forma que sobrevive.
 */

/** A rede de segurança. Lenta porque nada normal depende dela. */
const VARREDURA_MS = 60_000;

/** O lote por passada: duzentas saídas vencidas viram uma fila que drena, não um estouro. */
const LOTE = 25;

export interface AutomationRunner {
  /**
   * Enfileira as execuções de um acontecimento e acorda o motor. Best-effort, no molde do
   * `fireBookingNotification`: loga e engole. Automação com problema **nunca** derruba a
   * operação de negócio que já concluiu.
   */
  fire(command: EnqueueAutomationRunCommand): void;
  /** Uma passada manual — é por onde os testes andam sem depender de temporizador. */
  tick(now: Date): Promise<number>;
  stop(): void;
}

export function automationRunner(
  deps: ServerDeps,
  log: FastifyBaseLogger,
  options: { readonly enabled: boolean },
): AutomationRunner {
  // Cada processo reivindica com um nome próprio. Dois com o mesmo nome disputariam as
  // mesmas linhas e um desfaria a reivindicação do outro.
  const workerId = `${String(process.pid)}-${randomUUID().slice(0, 8)}`;
  const motor: AutomationRunnerDeps = {
    automations: deps.automations,
    runs: deps.automationRuns,
    steps: deps.automationRunSteps,
    memberships: deps.memberships,
    actions: automationActionRegistry(deps),
    finders: automationFinderRegistry(deps),
  };

  let rodando = false;
  let pendente = false;

  /**
   * Uma drenagem por vez. Sem isso, um empurrão durante outra drenagem abriria duas passadas
   * concorrentes no mesmo processo — e `pendente` garante que o empurrão que chegou no meio
   * não se perca: assim que a atual termina, roda de novo.
   */
  const drenar = async (now: Date): Promise<number> => {
    if (rodando) {
      pendente = true;
      return 0;
    }
    rodando = true;
    let feitas = 0;
    try {
      do {
        pendente = false;
        feitas += await resumeDueRuns(motor, { workerId, now, limit: LOTE });
      } while (pendente);
    } catch (error) {
      log.error({ err: error }, 'motor de automações falhou numa passada');
    } finally {
      rodando = false;
    }
    return feitas;
  };

  /**
   * AU-12 · AU-17 — a mesma passada cobre os dois gatilhos de tempo, com um `try` cada.
   *
   * Separados de propósito: uma agenda que falha não pode engolir a varredura do recorrente.
   * Quem tem "a cada um minuto" perde a fatia inteira quando a passada morre no meio — e
   * fatia perdida não volta, porque a chave de idempotência é do intervalo, não da tentativa.
   */
  const varrer = async (now: Date): Promise<void> => {
    try {
      await scanScheduledTriggers(
        { ...motor, schedule: deps.schedule },
        { today: hojeEm(now), now },
      );
    } catch (error) {
      log.error({ err: error }, 'varredura de gatilho por saída falhou');
    }
    try {
      await scanRecurringTriggers(motor, { now });
    } catch (error) {
      log.error({ err: error }, 'varredura de gatilho de tempo em tempo falhou');
    }
  };

  const timer = options.enabled
    ? setInterval(() => {
        const now = new Date();
        void varrer(now).then(() => drenar(now));
      }, VARREDURA_MS)
    : null;
  // Um temporizador com `unref` não segura o processo vivo: `Ctrl+C` e o encerramento do
  // Railway continuam funcionando como antes de o motor existir.
  timer?.unref();

  return {
    fire(command) {
      if (!options.enabled) return;
      void enqueueAutomationRun(motor, command)
        .then((abertas) => (abertas.length > 0 ? drenar(command.now) : 0))
        .catch((error: unknown) => {
          log.warn(
            { err: error, triggerType: command.triggerType },
            'gatilho de automação falhou (best-effort)',
          );
        });
    },

    async tick(now) {
      await varrer(now);
      return drenar(now);
    },

    stop() {
      if (timer !== null) clearInterval(timer);
    },
  };
}

/**
 * O dia de hoje no fuso da operação. A expedição é no Brasil e o servidor roda em UTC: sem o
 * deslocamento, "três dias antes da saída" dispararia no dia errado durante as três primeiras
 * horas de cada dia.
 */
function hojeEm(now: Date): ReturnType<typeof parseLocalDate> {
  const local = new Date(now.getTime() - 3 * 3_600_000);
  return parseLocalDate(local.toISOString().slice(0, 10));
}
