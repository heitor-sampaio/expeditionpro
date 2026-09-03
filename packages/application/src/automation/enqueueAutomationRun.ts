import type { AutomationRunnerDeps } from './runnerDeps.js';
import type { AutomationRunRecord } from './automationRunRepository.js';
import type { TriggerType } from './automationRepository.js';

/**
 * AU-05 — quantas execuções uma automação pode abrir por hora.
 *
 * Existe porque automação erra **em escala**: uma regra ruim manda a mesma mensagem para trinta
 * pessoas antes de alguém perceber. O teto não conserta a regra; ele transforma "trinta clientes
 * receberam" em "vinte tentativas foram barradas e o problema apareceu no log".
 */
export const TETO_POR_HORA = 20;

export interface EnqueueAutomationRunCommand {
  readonly tenantId: string;
  readonly triggerType: TriggerType;
  /** O que disparou: ids da conversa, da oportunidade, da inscrição. */
  readonly triggerRef: Record<string, unknown>;
  /** O contexto que as condições e os textos vão ler. */
  readonly variables: Record<string, unknown>;
  /** AU-12: só no gatilho temporal, que é varrido e passa de novo pela mesma saída. */
  readonly idempotencyKey?: string;
  readonly now: Date;
}

/**
 * AU-04 — o gatilho **enfileira e devolve**.
 *
 * Roda na borda, logo depois de o acontecimento de negócio ter concluído: grava uma execução
 * pendente por automação ligada para aquele gatilho, e volta. Quem executa é o motor, acordado
 * no ato — o webhook do provedor continua respondendo em milissegundos.
 *
 * Não é transacional com o acontecimento de propósito. Enfileirar dentro da transação faria um
 * problema na tabela de automações **derrubar um pagamento**, e num sistema que é financeiro
 * antes de ser CRM esse não é o lado certo para falhar. O preço é uma janela de milissegundos
 * entre o commit e o enfileiramento: pequena, conhecida, e do lado certo.
 */
export async function enqueueAutomationRun(
  deps: AutomationRunnerDeps,
  command: EnqueueAutomationRunCommand,
): Promise<AutomationRunRecord[]> {
  const todas = await deps.automations.list(command.tenantId);
  const interessadas = todas.filter((a) => a.enabled && a.triggerType === command.triggerType);

  const umaHoraAtras = new Date(command.now.getTime() - 3_600_000);
  const abertas: AutomationRunRecord[] = [];

  for (const automacao of interessadas) {
    const naUltimaHora = await deps.runs.countSince(command.tenantId, automacao.id, umaHoraAtras);
    if (naUltimaHora >= TETO_POR_HORA) continue;

    const run = await deps.runs.enqueue({
      tenantId: command.tenantId,
      automationId: automacao.id,
      triggerRef: command.triggerRef,
      idempotencyKey: command.idempotencyKey ?? null,
      variables: command.variables,
      // Agora: o gatilho de evento não espera. Quem decide o tempo é o bloco de espera que a
      // equipe desenhou, e ele aparece adiante, dentro do fluxo.
      wakeAt: command.now,
    });

    // `null` quer dizer que a chave de idempotência já existia — a varredura passou de novo
    // pela mesma saída, e isso é esperado, não erro.
    if (run !== null) abertas.push(run);
  }

  return abertas;
}
