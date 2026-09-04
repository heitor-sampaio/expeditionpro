import type { AutomationRunnerDeps } from './runnerDeps.js';
import type { AutomationRunRecord } from './automationRunRepository.js';
import type { TriggerType } from './automationRepository.js';

export interface EnqueueAutomationRunCommand {
  readonly tenantId: string;
  readonly triggerType: TriggerType;
  /** O que disparou: ids da conversa, da oportunidade, da inscrição. */
  readonly triggerRef: Record<string, unknown>;
  /** O contexto que as condições e os textos vão ler. */
  readonly variables: Record<string, unknown>;
  /** AU-12: só no gatilho temporal, que é varrido e passa de novo pela mesma saída. */
  readonly idempotencyKey?: string;
  /**
   * AU-21 — quando o tipo do gatilho não basta para escolher quem acorda.
   *
   * Um tenant tem vários ganchos de webhook — o do site, o do formulário, o do parceiro — e
   * todos chegam pelo mesmo tipo. Sem isto, a chamada do site dispararia o fluxo do parceiro,
   * com o corpo errado no contexto. Compara pares da configuração do gatilho; ausente, o
   * comportamento é o de sempre e todas as automações daquele tipo acordam.
   */
  readonly matchConfig?: Record<string, unknown>;
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
  const interessadas = todas.filter(
    (a) =>
      a.enabled && a.triggerType === command.triggerType && casaConfig(a.triggerConfig, command),
  );

  const abertas: AutomationRunRecord[] = [];

  for (const automacao of interessadas) {
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

/**
 * AU-21 — a configuração do gatilho casa com o que o acontecimento traz?
 *
 * Comparação como texto, de propósito: o que está no `jsonb` do desenho e o que chega da borda
 * passaram por caminhos diferentes, e um número que virou string numa das pontas não deveria
 * mudar quem acorda.
 */
function casaConfig(
  triggerConfig: Record<string, unknown>,
  command: EnqueueAutomationRunCommand,
): boolean {
  const exigido = command.matchConfig;
  if (exigido === undefined) return true;
  return Object.entries(exigido).every(
    ([chave, valor]) => String(triggerConfig[chave] ?? '') === String(valor ?? ''),
  );
}
