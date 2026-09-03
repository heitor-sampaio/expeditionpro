import { janelaDe } from '@expedition/domain';
import { TETO_POR_HORA } from './enqueueAutomationRun.js';
import type { AutomationRunnerDeps } from './runnerDeps.js';
import type { AutomationNode, RunContext } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { DueRunRef } from './automationRunRepository.js';

/**
 * AU-18 — quantos itens uma busca pode semear numa passada, aconteça o que acontecer.
 *
 * O bloco tem o próprio "no máximo", mas ele é digitado por gente e vai para `jsonb`. Este é o
 * teto que não depende de ninguém ter pensado direito: uma busca que devolvesse duzentas
 * conversas abriria duzentas execuções antes de o teto por hora perceber.
 */
export const TETO_DA_BUSCA = 25;

export interface SeedResult extends Record<string, unknown> {
  readonly encontrados: number;
  readonly semeados: number;
}

/**
 * AU-18 — abre uma execução por achado, começando no bloco seguinte à busca.
 *
 * **Uma execução por item, e não um laço dentro de uma.** É o que mantém o log respondendo
 * "por que este cliente recebeu isso?" (AU-06), o que faz o teto de passos e as tentativas
 * valerem por item — uma conversa que falha não derruba as outras vinte —, e o que evita um
 * ciclo no grafo, que AU-07 proíbe.
 *
 * A chave de idempotência é `bloco : entidade : fatia de tempo`, e a fatia é o próprio "parado
 * há N minutos" do bloco. Sem ela, uma busca que roda de cinco em cinco minutos semearia a
 * mesma conversa parada doze vezes por hora — e o cliente receberia doze mensagens.
 */
export async function seedRunsFromSearch(
  deps: AutomationRunnerDeps,
  ref: DueRunRef,
  no: AutomationNode,
  proximoNodeId: string,
  ctx: RequestContext,
  variaveis: RunContext,
  now: Date,
): Promise<SeedResult> {
  const busca = deps.finders[no.type];
  if (busca === undefined) {
    throw new Error(`este servidor não conhece a busca "${no.type}"`);
  }

  const achados = await busca({ ctx, config: no.config, variables: variaveis, now });
  const limite = Math.min(Number(no.config['limit']) || TETO_DA_BUSCA, TETO_DA_BUSCA);
  const janela = janelaDe({ amount: no.config['minutes'], unit: 'minutes' }, now);

  const umaHoraAtras = new Date(now.getTime() - 3_600_000);
  let semeados = 0;

  for (const item of achados.slice(0, limite)) {
    // AU-05: o teto por hora vale para o total da automação, e as filhas contam. É o mesmo
    // freio que impede uma regra ruim de alcançar trinta pessoas antes de alguém perceber.
    const naUltimaHora = await deps.runs.countSince(ref.tenantId, ref.automationId, umaHoraAtras);
    if (naUltimaHora >= TETO_POR_HORA) break;

    const aberta = await deps.runs.enqueue({
      tenantId: ref.tenantId,
      automationId: ref.automationId,
      triggerRef: { seededBy: ref.id, key: item.key },
      idempotencyKey: `${no.id}:${item.key}:${String(janela)}`,
      // O contexto da mãe desce junto: o que o gatilho trouxe continua valendo na filha.
      variables: { ...variaveis, ...item.variables },
      wakeAt: now,
      // Começar no bloco seguinte é o que faz a filha ser "o resto do fluxo", e não o fluxo
      // inteiro de novo — buscar outra vez, dentro de cada filha, seria fan-out ao quadrado.
      startNodeId: proximoNodeId,
    });
    if (aberta !== null) semeados += 1;
  }

  return { encontrados: achados.length, semeados };
}
