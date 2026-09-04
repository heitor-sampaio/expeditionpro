import { TETO_POR_HORA } from './enqueueAutomationRun.js';
import type { AutomationRunnerDeps } from './runnerDeps.js';
import type { AutomationNode, ListItem, RunContext } from '@expedition/domain';
import type { DueRunRef } from './automationRunRepository.js';

/**
 * AU-18 — quantos itens um "para cada" pode semear numa passada, aconteça o que acontecer.
 *
 * O bloco tem o próprio "no máximo", mas ele é digitado por gente e vai para `jsonb`. Este é o
 * teto que não depende de ninguém ter pensado direito: uma lista com duzentos clientes abriria
 * duzentas execuções antes de o teto por hora perceber.
 */
export const TETO_DA_BUSCA = 25;

export interface SeedResult extends Record<string, unknown> {
  readonly itens: number;
  readonly semeados: number;
}

/**
 * AU-18 · AU-20 — abre uma execução por item da lista, começando no bloco seguinte.
 *
 * **Uma execução por item, e não um laço dentro de uma.** É o que mantém o log respondendo "por
 * que este cliente recebeu isso?" (AU-06), o que faz o teto de passos e as tentativas valerem
 * por item — um cliente que falha não derruba os outros vinte —, e o que evita um ciclo no
 * grafo, que AU-07 proíbe.
 *
 * A chave de idempotência é `bloco : item : execução que originou`. A execução de origem entra
 * porque a lista vem de uma busca desta passada: duas passadas do mesmo fluxo são dois momentos
 * diferentes, e a segunda tem o direito de agir de novo sobre o mesmo cliente — quem decide se
 * isso se repete cedo demais é o filtro da busca, não uma trava aqui.
 */
export async function seedRunsFromList(
  deps: AutomationRunnerDeps,
  ref: DueRunRef,
  no: AutomationNode,
  proximoNodeId: string,
  itens: readonly ListItem[],
  variaveis: RunContext,
  now: Date,
): Promise<SeedResult> {
  const limite = Math.min(Number(no.config['limit']) || TETO_DA_BUSCA, TETO_DA_BUSCA);
  const umaHoraAtras = new Date(now.getTime() - 3_600_000);
  let semeados = 0;

  for (const item of itens.slice(0, limite)) {
    // AU-05: o teto por hora vale para o total da automação, e as filhas contam. É o mesmo
    // freio que impede uma regra ruim de alcançar trinta pessoas antes de alguém perceber.
    const naUltimaHora = await deps.runs.countSince(ref.tenantId, ref.automationId, umaHoraAtras);
    if (naUltimaHora >= TETO_POR_HORA) break;

    const aberta = await deps.runs.enqueue({
      tenantId: ref.tenantId,
      automationId: ref.automationId,
      triggerRef: { seededBy: ref.id, chave: item.chave },
      idempotencyKey: `${no.id}:${item.chave}:${ref.id}`,
      // O contexto de quem percorreu desce junto: o que o gatilho trouxe continua valendo.
      variables: { ...variaveis, ...item.dados },
      wakeAt: now,
      // Começar no bloco seguinte é o que faz a filha ser "o resto do fluxo", e não o fluxo
      // inteiro de novo — buscar outra vez, dentro de cada filha, seria fan-out ao quadrado.
      startNodeId: proximoNodeId,
    });
    if (aberta !== null) semeados += 1;
  }

  return { itens: itens.length, semeados };
}
