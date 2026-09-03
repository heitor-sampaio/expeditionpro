import type { AutomationActions } from './automationActions.js';
import type { AutomationFinders } from './automationFinders.js';
import type { AutomationRepository } from './automationRepository.js';
import type {
  AutomationRunRepository,
  AutomationRunStepRepository,
} from './automationRunRepository.js';
import type { MembershipRepository } from '../team/membershipRepository.js';

/**
 * §5.18 — o que o motor precisa, e nada além.
 *
 * `memberships` está aqui por causa do AU-03: o papel de quem ligou a automação é **relido a
 * cada execução**, e não lido do que foi guardado quando ela foi ligada. Sem isso, uma pessoa
 * desligada da equipe continuaria agindo por procuração pelo tempo que a automação existisse.
 *
 * `actions` é um mapa montado pela borda. O interpretador sabe que existe uma ação chamada
 * `send_message`; não sabe o que ela faz, e não importa caso de uso de feature nenhum (AU-08).
 */
export interface AutomationRunnerDeps {
  readonly automations: AutomationRepository;
  readonly runs: AutomationRunRepository;
  readonly steps: AutomationRunStepRepository;
  readonly memberships: MembershipRepository;
  readonly actions: AutomationActions;
  /**
   * AU-18 — as buscas, pelo mesmo desenho das ações: o interpretador sabe que existe uma
   * busca chamada `find_stale_conversations`, não sabe o que é uma conversa.
   */
  readonly finders: AutomationFinders;
}
