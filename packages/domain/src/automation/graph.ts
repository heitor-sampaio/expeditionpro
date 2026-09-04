/**
 * AU-01 · AU-07 — o grafo de uma automação.
 *
 * O desenho é **dado puro**: nós e ligações, sem nada de execução. Quem roda lê daqui e não
 * decide caminho — a decisão de "qual é o próximo" mora neste arquivo, e é testável sem banco,
 * sem React e sem relógio.
 *
 * A validação existe porque grafo torto vira problema em produção, de madrugada: um ciclo sem
 * espera faz o motor girar para sempre, mandando a mesma mensagem para o mesmo cliente até
 * alguém desligar; um nó órfão é trabalho que a equipe desenhou achando que ia rodar.
 */

import { ESPERA_MINIMA_MIN, minutosDaEspera as emMinutos, switchCases } from './interpreter.js';
import { TRIGGER_TYPES, type TriggerType } from './triggers.js';
import { INTERVALO_MINIMO_MIN, intervaloEmMinutos } from './recurring.js';
import { iteratedList, listName, searchMode } from './search.js';

export type NodeKind =
  | 'trigger'
  | 'condition'
  /** AU-15: separa em quantos caminhos a equipe precisar, mais o padrão. */
  | 'switch'
  /**
   * AU-18: busca uma lista e **semeia uma execução por achado**, cada uma com o contexto de
   * um item. Não itera dentro da execução: é isso que mantém o log respondendo "por que este
   * cliente?" e o que evita um laço no grafo.
   */
  | 'forEach'
  /**
   * AU-19: traz **um** item para o contexto e separa o caminho em achou e não achou. É o que
   * permite perguntar pelo que o gatilho não trouxe — "existe cartão deste contato no funil?".
   */
  | 'lookup'
  | 'setVariable'
  | 'delay'
  | 'action'
  | 'end';

/**
 * As saídas de um bloco. Condição tem duas; o resto tem uma; fim não tem; a escolha múltipla
 * tem uma por valor mais o padrão, e por isso a porta dela carrega o **id do caso** — se
 * fosse a posição na lista, apagar o primeiro valor faria a ligação do segundo passar a
 * apontar para o terceiro, em silêncio, depois de salvo.
 */
export type Port = 'next' | 'true' | 'false' | 'default' | `case_${string}`;

export interface AutomationNode {
  readonly id: string;
  readonly kind: NodeKind;
  /** O que o bloco faz dentro da espécie: `message_received`, `send_message`, `wait`… */
  readonly type: string;
  readonly config: Record<string, unknown>;
  /** Onde o bloco está no quadro. É do desenho, não da execução. */
  readonly position: { readonly x: number; readonly y: number };
}

export interface AutomationEdge {
  readonly id: string;
  readonly from: string;
  readonly port: Port;
  readonly to: string;
}

export interface AutomationGraph {
  readonly nodes: readonly AutomationNode[];
  readonly edges: readonly AutomationEdge[];
}

/**
 * Motivos de recusa, em código estável. A tela traduz para frase; o teste cobra o código, que
 * é o que não muda quando alguém melhora o texto.
 */
export type GraphProblem =
  | 'sem_gatilho'
  | 'gatilho_duplicado'
  | 'no_orfao'
  | 'ligacao_quebrada'
  | 'porta_invalida'
  | 'porta_ambigua'
  | 'condicao_incompleta'
  | 'gatilho_sem_caminho'
  | 'gatilho_desconhecido'
  | 'espera_curta'
  | 'intervalo_curto'
  | 'escolha_sem_valores'
  | 'escolha_incompleta'
  | 'busca_sem_caminho'
  | 'busca_duplicada'
  | 'busca_um_incompleta'
  | 'lista_sem_origem'
  | 'ciclo_sem_espera';

const PORTAS_FIXAS: Record<Exclude<NodeKind, 'switch'>, readonly Port[]> = {
  trigger: ['next'],
  condition: ['true', 'false'],
  forEach: ['next'],
  lookup: ['true', 'false'],
  setVariable: ['next'],
  delay: ['next'],
  action: ['next'],
  end: [],
};

/**
 * As saídas que **este** bloco tem. Só a escolha múltipla depende da configuração, e é por
 * isso que a pergunta é feita ao nó e não à espécie: o quadro desenha as alças a partir daqui,
 * e o validador recusa ligação que saia de porta inexistente com a mesma resposta.
 */
export function portsOf(node: AutomationNode): readonly Port[] {
  if (node.kind !== 'switch') return PORTAS_FIXAS[node.kind];
  return [...switchCases(node.config).map((caso): Port => `case_${caso.id}`), 'default'];
}

export function validateGraph(graph: AutomationGraph): GraphProblem[] {
  const problemas = new Set<GraphProblem>();
  const porId = new Map(graph.nodes.map((no) => [no.id, no]));

  const gatilhos = graph.nodes.filter((no) => no.kind === 'trigger');
  if (gatilhos.length === 0) problemas.add('sem_gatilho');
  if (gatilhos.length > 1) problemas.add('gatilho_duplicado');
  // AU-14: a lista fechada de gatilhos mora aqui desde que o gatilho virou bloco do quadro.
  // Um tipo inventado é uma automação que nunca dispara, e ninguém descobre por quê.
  for (const no of gatilhos) {
    if (!TRIGGER_TYPES.includes(no.type as TriggerType)) problemas.add('gatilho_desconhecido');
    // AU-17: o piso do gatilho de tempo é o mesmo da espera — a varredura de rede é de um
    // minuto, e abaixo disso a automação faria coisa diferente do que a tela mostra.
    if (no.type === 'recurring' && intervaloEmMinutos(no.config) < INTERVALO_MINIMO_MIN) {
      problemas.add('intervalo_curto');
    }
  }

  const usadas = new Set<string>();
  for (const ligacao of graph.edges) {
    const origem = porId.get(ligacao.from);
    if (origem === undefined || !porId.has(ligacao.to)) {
      problemas.add('ligacao_quebrada');
      continue;
    }
    if (!portsOf(origem).includes(ligacao.port)) {
      problemas.add('porta_invalida');
      continue;
    }
    // Uma porta, um caminho: duas saídas do mesmo lugar deixariam a ordem de execução no acaso.
    const chave = `${ligacao.from}:${ligacao.port}`;
    if (usadas.has(chave)) problemas.add('porta_ambigua');
    usadas.add(chave);
  }

  // Espera abaixo do piso não seria respeitada como desenhada, e a automação faria coisa
  // diferente do que a tela mostra. Recusar é mais honesto que arredondar em silêncio.
  for (const no of graph.nodes) {
    if (no.kind === 'delay' && emMinutos(no.config) < ESPERA_MINIMA_MIN) {
      problemas.add('espera_curta');
    }
  }

  // Condição com um lado só é armadilha: o outro caminho existe na cabeça de quem desenhou.
  for (const no of graph.nodes) {
    if (no.kind !== 'condition') continue;
    const temSim = graph.edges.some((e) => e.from === no.id && e.port === 'true');
    const temNao = graph.edges.some((e) => e.from === no.id && e.port === 'false');
    if (!temSim || !temNao) problemas.add('condicao_incompleta');
  }

  // AU-15: pela mesma razão da condição, e mais uma — escolha sem valor nenhum manda todo
  // mundo pelo padrão, e é um bloco que está no quadro sem separar nada.
  for (const no of graph.nodes) {
    if (no.kind !== 'switch') continue;
    if (switchCases(no.config).length === 0) problemas.add('escolha_sem_valores');
    const ligadas = new Set(graph.edges.filter((e) => e.from === no.id).map((e) => e.port));
    if (portsOf(no).some((porta) => !ligadas.has(porta))) problemas.add('escolha_incompleta');
  }

  /*
   * AU-19 — buscar **um** não semeia nada, então duas no mesmo fluxo são legítimas. O que elas
   * precisam é dos dois caminhos, pela mesma razão da condição: "não achou" é um destino tão
   * legítimo quanto "achou", e é justamente nele que mora o "então crie".
   */
  for (const no of graph.nodes.filter((n) => n.kind === 'lookup')) {
    const achou = graph.edges.some((e) => e.from === no.id && e.port === 'true');
    const naoAchou = graph.edges.some((e) => e.from === no.id && e.port === 'false');
    if (!achou || !naoAchou) problemas.add('busca_um_incompleta');
  }

  /*
   * AU-18 — a busca que semeia precisa levar a algum lugar, e não pode haver duas.
   *
   * Buscar sem caminho depois é abrir execução à toa, de cinco em cinco minutos. E duas seriam
   * fan-out de fan-out: dez conversas viram dez execuções, cada uma buscando de novo — o
   * crescimento é multiplicativo, e o teto por hora descobriria isso tarde demais.
   */
  const buscas = graph.nodes.filter((no) => no.kind === 'forEach');
  if (buscas.length > 1) problemas.add('busca_duplicada');

  /*
   * AU-20 — a lista que o "para cada" percorre precisa ser guardada por alguma busca.
   *
   * Errar o nome não daria erro nenhum: a lista não existe, zero itens são semeados, e o fluxo
   * termina como se não houvesse ninguém para agir. É o pior tipo de defeito — o que parece
   * funcionar. Só a busca em modo "todos" guarda lista; a de "o primeiro" põe os campos no
   * contexto e não serve de origem.
   */
  const listasGuardadas = new Set(
    graph.nodes
      .filter((no) => no.kind === 'lookup' && searchMode(no.config) === 'all')
      .map((no) => listName(no.config)),
  );
  for (const no of buscas) {
    if (!graph.edges.some((e) => e.from === no.id)) problemas.add('busca_sem_caminho');
    if (!listasGuardadas.has(iteratedList(no.config))) problemas.add('lista_sem_origem');
  }

  const inicio = gatilhos[0];
  if (inicio !== undefined) {
    // Gatilho sem saída é bloco solto: ligar uma automação assim não faz nada, e quem ligou
    // fica esperando um efeito que nunca vem.
    if (!graph.edges.some((e) => e.from === inicio.id)) problemas.add('gatilho_sem_caminho');
    const alcancados = alcancaveis(graph, inicio.id);
    if (alcancados.size !== graph.nodes.length) problemas.add('no_orfao');
    if (temCicloSemEspera(graph, inicio.id, porId)) problemas.add('ciclo_sem_espera');
  }

  return [...problemas];
}

/** Onde o motor entra e para onde vai. `null` como atual significa "começo". */
export function nextNode(
  graph: AutomationGraph,
  atual: string | null,
  port: Port,
): AutomationNode | null {
  if (atual === null) return graph.nodes.find((no) => no.kind === 'trigger') ?? null;
  const ligacao = graph.edges.find((e) => e.from === atual && e.port === port);
  return ligacao === undefined ? null : (graph.nodes.find((no) => no.id === ligacao.to) ?? null);
}

function alcancaveis(graph: AutomationGraph, inicio: string): Set<string> {
  const vistos = new Set<string>([inicio]);
  const fila = [inicio];
  while (fila.length > 0) {
    const atual = fila.pop()!;
    for (const ligacao of graph.edges) {
      if (ligacao.from !== atual || vistos.has(ligacao.to)) continue;
      vistos.add(ligacao.to);
      fila.push(ligacao.to);
    }
  }
  return vistos;
}

/**
 * Ciclo só é problema quando **não passa por uma espera**. Com espera, é como se escreve uma
 * cobrança recorrente — legítimo e desejado. Sem, o motor percorre os mesmos nós para sempre.
 *
 * A busca em profundidade guarda os nós do caminho atual: reencontrar um deles é ciclo, e o
 * ciclo só conta se nenhuma espera estiver entre eles.
 */
function temCicloSemEspera(
  graph: AutomationGraph,
  inicio: string,
  porId: Map<string, AutomationNode>,
): boolean {
  const caminho: string[] = [];
  const noCaminho = new Set<string>();
  const prontos = new Set<string>();

  const visitar = (id: string): boolean => {
    if (noCaminho.has(id)) {
      const desde = caminho.indexOf(id);
      return !caminho.slice(desde).some((passo) => porId.get(passo)?.kind === 'delay');
    }
    if (prontos.has(id)) return false;

    noCaminho.add(id);
    caminho.push(id);
    for (const ligacao of graph.edges) {
      if (ligacao.from === id && visitar(ligacao.to)) return true;
    }
    caminho.pop();
    noCaminho.delete(id);
    prontos.add(id);
    return false;
  };

  return visitar(inicio);
}
