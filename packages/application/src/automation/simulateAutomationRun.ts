import {
  evaluateCondition,
  isNodeDisabled,
  iteratedList,
  listItems,
  listName,
  nextNode,
  readPath,
  renderTemplate,
  resolveDelay,
  resolveSwitch,
  searchMode,
  type AutomationNode,
  type Port,
  type RunContext,
} from '@expedition/domain';
import { requireTeam } from '../audience.js';
import { NotFoundError } from '../errors.js';
import { TETO_DE_PASSOS } from './advanceAutomationRun.js';
import type { AutomationRunnerDeps } from './runnerDeps.js';
import type { RequestContext } from '../context.js';

/**
 * AU-25 — o ensaio: percorrer o desenho sem ligar a automação.
 *
 * Antes disto, a única forma de saber o que um fluxo faz era ligá-lo sobre gente de verdade, e
 * o que sai por WhatsApp não volta. O ensaio anda pelo mesmo grafo com os dados que a equipe
 * informa e mostra por onde passaria.
 *
 * **O que ele faz e o que não faz.** Ação nenhuma é executada — a mais inofensiva do catálogo
 * manda mensagem para um cliente. As buscas, sim, rodam: elas só leem, e é o que faz o ensaio
 * responder à pergunta que interessa, "com os dados de hoje, esta condição dá sim ou não?".
 * Nada é gravado: ensaio não vira execução e não aparece no log da automação (AU-06), senão o
 * registro de "o que o sistema fez sozinho" passaria a ter dentro coisas que ele não fez.
 *
 * **Por que não é o mesmo código do motor.** O interpretador de verdade é feito de persistência:
 * reivindica, grava passo, dorme numa espera, conta tentativa, semeia execução filha. O ensaio
 * não faz nada disso — ele anda e anota. Ter os dois no mesmo laço significaria um parâmetro
 * `ensaio` cortando cada bloco daquele arquivo, e é assim que se ganha um motor que faz coisa
 * diferente do que o teste do motor cobre. As decisões de caminho, que são o que não pode
 * divergir, moram no domínio e são as mesmas nos dois.
 */

export interface SimulatedStep {
  readonly nodeId: string;
  readonly kind: string;
  readonly type: string;
  /** `faria`, `esperaria`, `percorreria`, ou a porta escolhida — como o log de verdade. */
  readonly outcome: string;
  readonly detail: Record<string, unknown>;
}

export interface SimulateCommand {
  readonly automationId: string;
  /** Os dados que o gatilho traria. Quem ensaia digita o que quer ver acontecer. */
  readonly variables: RunContext;
  readonly now: Date;
}

export async function simulateAutomationRun(
  deps: AutomationRunnerDeps,
  ctx: RequestContext,
  command: SimulateCommand,
): Promise<SimulatedStep[]> {
  // Ensaiar mostra dado de cliente — o texto resolvido de cada mensagem, o resultado de cada
  // busca. É guarda de equipe pela mesma razão que ler o log da automação é.
  requireTeam(ctx);

  const automacao = await deps.automations.findById(ctx.tenantId, command.automationId);
  if (automacao === null) throw new NotFoundError('automação');

  const variaveis: RunContext = { ...command.variables };
  const passos: SimulatedStep[] = [];
  let atual = nextNode(automacao.graph, null, 'next');

  while (atual !== null && passos.length < TETO_DE_PASSOS) {
    const porta = await ensaiarNo(deps, ctx, atual, variaveis, command.now, passos);
    if (porta === null) break;
    atual = nextNode(automacao.graph, atual.id, porta);
  }

  return passos;
}

/** Anota o que este nó faria e devolve por onde seguir. `null` encerra o ensaio. */
async function ensaiarNo(
  deps: AutomationRunnerDeps,
  ctx: RequestContext,
  no: AutomationNode,
  variaveis: RunContext,
  now: Date,
  passos: SimulatedStep[],
): Promise<Port | null> {
  const anotar = (outcome: string, detail: Record<string, unknown>): void => {
    passos.push({ nodeId: no.id, kind: no.kind, type: no.type, outcome, detail });
  };

  if (isNodeDisabled(no)) {
    anotar('pularia', {});
    return 'next';
  }

  if (no.kind === 'trigger') {
    anotar('disparou', {});
    return 'next';
  }

  if (no.kind === 'end') {
    anotar('fim', {});
    return null;
  }

  if (no.kind === 'delay') {
    // O ensaio não dorme: seria inútil ver metade de um fluxo de três dias.
    anotar('esperaria', { ate: resolveDelay(no.config, now) });
    return 'next';
  }

  if (no.kind === 'condition') {
    const porta: Port = evaluateCondition(no.config, variaveis) ? 'true' : 'false';
    anotar(porta, comValorLido(no, variaveis));
    return porta;
  }

  if (no.kind === 'switch') {
    const porta = resolveSwitch(no.config, variaveis);
    anotar(porta, comValorLido(no, variaveis));
    return porta;
  }

  if (no.kind === 'setVariable') {
    const nome = String(no.config['name'] ?? '').trim();
    const valor = renderTemplate(String(no.config['value'] ?? ''), variaveis, { agora: now });
    if (nome !== '') variaveis[nome] = valor;
    anotar('definiu', { [nome]: valor });
    return 'next';
  }

  if (no.kind === 'lookup') {
    const busca = deps.finders[no.type];
    if (busca === undefined) {
      anotar('erro', { motivo: `este servidor não conhece a busca "${no.type}"` });
      return null;
    }

    const achados = await busca({ ctx, config: no.config, variables: variaveis, now });
    const porta: Port = achados.length === 0 ? 'false' : 'true';

    if (searchMode(no.config) === 'all') {
      variaveis[listName(no.config)] = achados.map((item) => ({
        chave: item.key,
        dados: item.variables,
      }));
    } else {
      const primeiro = achados[0];
      if (primeiro !== undefined) Object.assign(variaveis, primeiro.variables);
    }

    anotar(porta, { entidade: no.config['entity'], achados: achados.length });
    return porta;
  }

  if (no.kind === 'forEach') {
    /*
     * Na vida real cada item vira uma execução própria. No ensaio o caminho é um só, e mostrar
     * o do primeiro item é o que responde "o que aconteceria com cada um deles?" — o número
     * de itens fica anotado, que é a outra metade da pergunta.
     */
    const itens = listItems(variaveis, iteratedList(no.config));
    const primeiro = itens[0];
    if (primeiro !== undefined) Object.assign(variaveis, primeiro.dados);
    anotar('percorreria', { itens: itens.length, lista: iteratedList(no.config) });
    return 'next';
  }

  // Ação: o que interessa é o que ela **receberia**, com os marcadores já trocados. É onde se
  // vê que `{{contato.nome}}` ia sair vazio antes de a mensagem sair vazia.
  const config: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(no.config)) {
    config[chave] =
      typeof valor === 'string' && chave !== 'code'
        ? renderTemplate(valor, variaveis, { agora: now })
        : valor;
  }
  anotar('faria', config);
  return 'next';
}

/**
 * AU-26 — o valor que o desvio leu, junto do campo.
 *
 * "Saiu pelo não" é metade da resposta; a outra metade é *o que estava lá*. Sem isso, entender
 * um desvio errado exige reconstituir o contexto de cabeça.
 */
function comValorLido(no: AutomationNode, variaveis: RunContext): Record<string, unknown> {
  const campo = String(no.config['field'] ?? '');
  return { campo, valor: campo === '' ? null : readPath(variaveis, campo) };
}
