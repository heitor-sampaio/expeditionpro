import type { RequestContext } from '../context.js';
import type { RunContext } from '@expedition/domain';

/**
 * AU-18 — o que uma busca de automação pode procurar.
 *
 * É o porto irmão de `AutomationActions`, e existe pela mesma razão: o interpretador sabe que
 * existe uma busca chamada `find_stale_conversations`, não sabe o que é uma conversa. Quem
 * monta o mapa de verdade é a borda, que já conhece os repositórios.
 *
 * A busca **lê**; ela não muda nada. Quem muda são as ações do fluxo que ela semeia — e cada
 * uma roda na sua própria execução, com o log e os tetos que toda execução tem.
 */
export interface AutomationFinderInput {
  /** AU-03: montado com o papel **vigente** de quem ligou a automação. */
  readonly ctx: RequestContext;
  readonly config: Record<string, unknown>;
  /** O contexto de quem buscou — o gatilho de tempo põe a data e a hora aqui. */
  readonly variables: RunContext;
  /** O instante da passada. A busca não lê relógio por dentro, como nada aqui. */
  readonly now: Date;
}

/**
 * Um achado. A `key` identifica a entidade e entra na chave de idempotência: é ela que impede
 * a mesma conversa de ser semeada de novo enquanto continua parada, a cada cinco minutos.
 */
export interface FoundItem {
  readonly key: string;
  /** O que a execução semeada vai ver como contexto, além do que a mãe já tinha. */
  readonly variables: RunContext;
}

export type AutomationFinder = (input: AutomationFinderInput) => Promise<readonly FoundItem[]>;

export type AutomationFinders = Readonly<Record<string, AutomationFinder>>;
