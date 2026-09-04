import { validateGraph } from '@expedition/domain';
import { requireTeamAdmin } from '../team/teamGuards.js';
import { BusinessRuleError } from '../errors.js';
import { exigir } from './getAutomation.js';
import type { AutomationGraph } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { AutomationDeps } from './automationDeps.js';
import type { AutomationRecord, TriggerType } from './automationRepository.js';

export interface SaveAutomationGraphCommand {
  readonly automationId: string;
  readonly graph: AutomationGraph;
}

/**
 * AU-07 — guarda o desenho, e só se ele fizer sentido.
 *
 * O motivo da recusa sobe junto: "grafo inválido" sem dizer o quê não conserta nada, e quem
 * está desenhando não tem como adivinhar qual das oito regras foi quebrada.
 *
 * **Automação ligada não se edita.** Mexer no desenho do que já está agindo sobre clientes
 * mudaria a regra no meio do caminho, com execuções em andamento. Desligar primeiro é o ato
 * consciente que separa "estou pensando" de "está valendo".
 */
export async function saveAutomationGraph(
  deps: AutomationDeps,
  ctx: RequestContext,
  command: SaveAutomationGraphCommand,
): Promise<AutomationRecord> {
  requireTeamAdmin(ctx, 'editar automação');

  const automacao = await exigir(deps, ctx, command.automationId);
  if (automacao.enabled) {
    throw new BusinessRuleError(
      'automation_enabled',
      'Desligue a automação antes de mudar o desenho: ela está agindo sobre clientes agora.',
    );
  }

  assertGrafoValido(command.graph);

  /*
   * AU-14 — a coluna do gatilho é **cópia** do bloco que está no quadro.
   *
   * Ela existe por desempenho: cada evento procura por ela, em milissegundos, quem tem
   * interesse. Mas a verdade é o desenho, e por isso a cópia se refaz a cada salvamento — em
   * vez de ser escolhida num formulário à parte, que é como uma automação passaria a reagir a
   * um evento que ninguém desenhou. A configuração desce junto: a varredura temporal lê o
   * "quantos dias antes" da coluna, e ele é digitado no inspetor do bloco.
   */
  const gatilho = command.graph.nodes.find((no) => no.kind === 'trigger');

  return deps.automations.update(ctx.tenantId, automacao.id, {
    graph: command.graph,
    triggerType: (gatilho?.type ?? null) as TriggerType | null,
    triggerConfig: gatilho?.config ?? {},
  });
}

const EXPLICACAO: Record<string, string> = {
  sem_gatilho: 'falta o bloco de gatilho',
  gatilho_duplicado: 'há mais de um gatilho, e só um pode começar',
  no_orfao: 'há bloco que nenhum caminho alcança',
  ligacao_quebrada: 'há ligação apontando para bloco que não existe',
  porta_invalida: 'há ligação saindo de uma saída que aquele bloco não tem',
  porta_ambigua: 'há duas ligações saindo da mesma saída',
  condicao_incompleta: 'há condição sem os dois caminhos, sim e não',
  gatilho_sem_caminho: 'o gatilho não leva a lugar nenhum',
  gatilho_desconhecido: 'o bloco de gatilho não é um gatilho que este sistema conhece',
  busca_sem_caminho: 'a busca não leva a lugar nenhum, e abriria execução à toa',
  busca_duplicada: 'há mais de um "para cada", e um dentro do outro multiplica execução',
  busca_um_incompleta: 'há bloco de buscar sem os dois caminhos, achou e não achou',
  lista_sem_origem: 'há um "para cada" apontando para uma lista que nenhuma busca guarda',
  intervalo_curto: 'o gatilho de tempo pede intervalo menor que um minuto',
  ciclo_sem_espera: 'há um ciclo sem espera, e ele rodaria para sempre',
  espera_curta: 'há espera menor que um minuto, e o motor não respeitaria esse intervalo',
  escolha_sem_valores: 'há escolha múltipla sem valor nenhum, e ela não separaria caminho',
  escolha_incompleta: 'há escolha múltipla com saída sem caminho, inclusive o padrão',
};

export function assertGrafoValido(graph: AutomationGraph): void {
  const problemas = validateGraph(graph);
  if (problemas.length === 0) return;
  throw new BusinessRuleError(
    'invalid_graph',
    `O desenho não fecha: ${problemas.map((p) => EXPLICACAO[p] ?? p).join('; ')}.`,
  );
}
