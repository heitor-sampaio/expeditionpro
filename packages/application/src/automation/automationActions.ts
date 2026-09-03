import type { RequestContext } from '../context.js';
import type { RunContext } from '@expedition/domain';

/**
 * AU-08 — o que uma ação de automação pode fazer.
 *
 * Toda ação passa por um caso de uso que **já existe**, com as guardas de audiência que já
 * existem: automação não é caminho paralelo para o banco. Este porto é o que mantém o
 * interpretador ignorante de conversa, funil e inscrição — ele sabe que existe uma ação
 * chamada `send_message`, não sabe o que ela faz.
 *
 * Quem monta o mapa de verdade é a borda, no `automationActionRegistry`. O interpretador
 * recebe o mapa pronto e nunca importa um caso de uso de feature.
 */

export interface AutomationActionInput {
  /** AU-03: montado com o papel **vigente** de quem ligou a automação, relido a cada execução. */
  readonly ctx: RequestContext;
  readonly config: Record<string, unknown>;
  /** O contexto do gatilho mais as variáveis que o fluxo definiu pelo caminho. */
  readonly variables: RunContext;
}

/**
 * O que a ação devolve vira o `detail` do passo no log (AU-06) — é o que responde "o que o
 * provedor respondeu?" quando alguém pergunta por que a mensagem saiu.
 */
export type AutomationAction = (input: AutomationActionInput) => Promise<Record<string, unknown>>;

export type AutomationActions = Readonly<Record<string, AutomationAction>>;
