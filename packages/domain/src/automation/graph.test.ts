import { describe, expect, it } from 'vitest';
import { nextNode, validateGraph, type AutomationGraph } from './graph.js';

/**
 * AU-01 · AU-07 — o grafo de uma automação, validado antes de existir.
 *
 * O desenho é dado puro: nós e ligações. Quem executa lê daqui e não decide nada — a decisão
 * de "qual é o próximo" mora nesta função, e é testável sem banco, sem React e sem relógio.
 *
 * A validação existe porque grafo torto vira problema **em produção, de madrugada**: um ciclo
 * sem espera faz o motor girar para sempre; um nó órfão é trabalho que a equipe desenhou
 * achando que ia rodar.
 */

const gatilho = {
  id: 'g1',
  kind: 'trigger',
  type: 'message_received',
  config: {},
  position: { x: 0, y: 0 },
} as const;
const acao = {
  id: 'a1',
  kind: 'action',
  type: 'send_message',
  config: {},
  position: { x: 0, y: 120 },
} as const;
const fim = { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 0, y: 240 } } as const;

const simples: AutomationGraph = {
  nodes: [gatilho, acao, fim],
  edges: [
    { id: 'e1', from: 'g1', port: 'next', to: 'a1' },
    { id: 'e2', from: 'a1', port: 'next', to: 'f1' },
  ],
};

describe('AU-07: grafo válido', () => {
  it('gatilho, ação e fim ligados em sequência passa', () => {
    expect(validateGraph(simples)).toEqual([]);
  });

  it('grafo vazio é recusado — automação sem gatilho nunca roda', () => {
    expect(validateGraph({ nodes: [], edges: [] })).toContain('sem_gatilho');
  });

  /** Gatilho sozinho é bloco solto: ligar isso não faz nada, e quem ligou fica esperando. */
  it('gatilho sem nada depois é recusado', () => {
    expect(validateGraph({ nodes: [gatilho], edges: [] })).toContain('gatilho_sem_caminho');
  });

  it('dois gatilhos é recusado: qual dos dois começa?', () => {
    const dois = {
      ...simples,
      nodes: [...simples.nodes, { ...gatilho, id: 'g2' }],
    };
    expect(validateGraph(dois)).toContain('gatilho_duplicado');
  });

  /** Nó solto é trabalho que a equipe desenhou achando que ia rodar, e nunca roda. */
  it('nó que ninguém alcança é recusado', () => {
    const orfao = {
      ...simples,
      nodes: [...simples.nodes, { ...acao, id: 'a2' }],
    };
    expect(validateGraph(orfao)).toContain('no_orfao');
  });

  it('ligação apontando para nó inexistente é recusada', () => {
    const quebrada = {
      ...simples,
      edges: [...simples.edges, { id: 'e3', from: 'a1', port: 'next' as const, to: 'nao-existe' }],
    };
    expect(validateGraph(quebrada)).toContain('ligacao_quebrada');
  });

  it('condição precisa das duas saídas — meio caminho é armadilha', () => {
    const condicao = {
      nodes: [
        gatilho,
        { id: 'c1', kind: 'condition', type: 'field', config: {}, position: { x: 0, y: 60 } },
        fim,
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'c1' },
        { id: 'e2', from: 'c1', port: 'true', to: 'f1' },
      ],
    } as AutomationGraph;

    expect(validateGraph(condicao)).toContain('condicao_incompleta');
  });

  it('porta que não existe naquele bloco é recusada', () => {
    const porta = {
      ...simples,
      edges: [{ id: 'e1', from: 'g1', port: 'true' as const, to: 'a1' }],
    };
    expect(validateGraph(porta)).toContain('porta_invalida');
  });

  /**
   * O ciclo é o erro caro: sem espera no caminho, o motor percorre os mesmos nós para sempre,
   * mandando a mesma mensagem para o mesmo cliente até alguém desligar.
   */
  it('ciclo sem espera é recusado', () => {
    const laco: AutomationGraph = {
      nodes: [gatilho, acao],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'a1' },
        { id: 'e2', from: 'a1', port: 'next', to: 'a1' },
      ],
    };
    expect(validateGraph(laco)).toContain('ciclo_sem_espera');
  });

  /** Com espera no caminho, o ciclo é legítimo: é como se escreve uma cobrança recorrente. */
  it('ciclo com espera passa', () => {
    const comEspera: AutomationGraph = {
      nodes: [
        gatilho,
        {
          id: 'w1',
          kind: 'delay',
          type: 'wait',
          config: { amount: 1, unit: 'days' },
          position: { x: 0, y: 60 },
        },
        acao,
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'w1' },
        { id: 'e2', from: 'w1', port: 'next', to: 'a1' },
        { id: 'e3', from: 'a1', port: 'next', to: 'w1' },
      ],
    };
    expect(validateGraph(comEspera)).toEqual([]);
  });

  it('duas ligações saindo da mesma porta é recusado — o caminho tem que ser um só', () => {
    const bifurcada = {
      ...simples,
      edges: [...simples.edges, { id: 'e3', from: 'g1', port: 'next' as const, to: 'f1' }],
    };
    expect(validateGraph(bifurcada)).toContain('porta_ambigua');
  });
});

describe('AU-01: por onde o motor anda', () => {
  it('o começo é o gatilho', () => {
    expect(nextNode(simples, null, 'next')?.id).toBe('g1');
  });

  it('segue a ligação da porta pedida', () => {
    expect(nextNode(simples, 'g1', 'next')?.id).toBe('a1');
  });

  it('porta sem ligação encerra o ramo', () => {
    expect(nextNode(simples, 'f1', 'next')).toBeNull();
  });

  it('condição escolhe pelo lado que a decisão deu', () => {
    const grafo: AutomationGraph = {
      nodes: [
        gatilho,
        { id: 'c1', kind: 'condition', type: 'field', config: {}, position: { x: 0, y: 60 } },
        acao,
        fim,
      ],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'c1' },
        { id: 'e2', from: 'c1', port: 'true', to: 'a1' },
        { id: 'e3', from: 'c1', port: 'false', to: 'f1' },
      ],
    };

    expect(nextNode(grafo, 'c1', 'true')?.id).toBe('a1');
    expect(nextNode(grafo, 'c1', 'false')?.id).toBe('f1');
  });
});

/**
 * AU-07 — a espera curta demais.
 *
 * A varredura de rede do motor é de um minuto. Uma espera abaixo disso não seria respeitada
 * como desenhada, e a automação faria coisa diferente do que a tela mostra — o pior tipo de
 * divergência, porque ninguém desconfia do desenho. Recusar ao salvar é mais honesto que
 * arredondar em silêncio na execução.
 */
describe('AU-07: espera abaixo do piso', () => {
  const comEspera = (config: Record<string, unknown>): AutomationGraph => ({
    nodes: [
      gatilho,
      { id: 'w1', kind: 'delay', type: 'wait', config, position: { x: 0, y: 60 } },
      fim,
    ],
    edges: [
      { id: 'e1', from: 'g1', port: 'next', to: 'w1' },
      { id: 'e2', from: 'w1', port: 'next', to: 'f1' },
    ],
  });

  it('espera de meio minuto é recusada', () => {
    expect(validateGraph(comEspera({ amount: 0.5, unit: 'minutes' }))).toContain('espera_curta');
  });

  it('espera de zero é recusada — não é espera, é engano', () => {
    expect(validateGraph(comEspera({ amount: 0, unit: 'days' }))).toContain('espera_curta');
  });

  it('um minuto passa: é o piso, não o proibido', () => {
    expect(validateGraph(comEspera({ amount: 1, unit: 'minutes' }))).toEqual([]);
  });

  it('três dias passa', () => {
    expect(validateGraph(comEspera({ amount: 3, unit: 'days' }))).toEqual([]);
  });
});
