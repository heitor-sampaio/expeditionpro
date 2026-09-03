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

import { ESPERA_MINIMA_MIN, minutosDaEspera as emMinutos } from './interpreter.js';

export type NodeKind = 'trigger' | 'condition' | 'setVariable' | 'delay' | 'action' | 'end';

/** As saídas de cada espécie de bloco. Condição tem duas; o resto tem uma; fim não tem. */
export type Port = 'next' | 'true' | 'false';

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
  | 'espera_curta'
  | 'ciclo_sem_espera';

const PORTAS: Record<NodeKind, readonly Port[]> = {
  trigger: ['next'],
  condition: ['true', 'false'],
  setVariable: ['next'],
  delay: ['next'],
  action: ['next'],
  end: [],
};

export function validateGraph(graph: AutomationGraph): GraphProblem[] {
  const problemas = new Set<GraphProblem>();
  const porId = new Map(graph.nodes.map((no) => [no.id, no]));

  const gatilhos = graph.nodes.filter((no) => no.kind === 'trigger');
  if (gatilhos.length === 0) problemas.add('sem_gatilho');
  if (gatilhos.length > 1) problemas.add('gatilho_duplicado');

  const usadas = new Set<string>();
  for (const ligacao of graph.edges) {
    const origem = porId.get(ligacao.from);
    if (origem === undefined || !porId.has(ligacao.to)) {
      problemas.add('ligacao_quebrada');
      continue;
    }
    if (!PORTAS[origem.kind].includes(ligacao.port)) {
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
