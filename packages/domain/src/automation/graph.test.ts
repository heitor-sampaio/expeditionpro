import { describe, expect, it } from 'vitest';
import { nextNode, portsOf, validateGraph, type AutomationGraph } from './graph.js';
import { TRIGGER_TYPES } from './triggers.js';

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

/**
 * AU-15 — a escolha múltipla.
 *
 * A condição separa em dois; a escolha múltipla separa em quantos a equipe precisar, mais o
 * padrão. É o bloco que evita a escada de cinco condições encadeadas para responder a cinco
 * roteiros diferentes — e escada de condição é onde se erra o lado do "sim".
 *
 * Cada caso tem **id próprio**, e a saída é `case_<id>`: se a porta fosse a posição na lista,
 * apagar o primeiro valor faria a ligação do segundo passar a apontar para o terceiro, em
 * silêncio, depois de salvo.
 */
describe('AU-15: as saídas de uma escolha múltipla', () => {
  const escolha = {
    id: 's1',
    kind: 'switch',
    type: 'match',
    config: {
      field: 'mensagem.texto',
      cases: [
        { id: 'c1', value: 'preço' },
        { id: 'c2', value: 'data' },
      ],
    },
    position: { x: 0, y: 60 },
  } as const;

  const completo: AutomationGraph = {
    nodes: [gatilho, escolha, fim],
    edges: [
      { id: 'e1', from: 'g1', port: 'next', to: 's1' },
      { id: 'e2', from: 's1', port: 'case_c1', to: 'f1' },
      { id: 'e3', from: 's1', port: 'case_c2', to: 'f1' },
      { id: 'e4', from: 's1', port: 'default', to: 'f1' },
    ],
  };

  it('uma saída por valor, mais o padrão', () => {
    expect(portsOf(escolha)).toEqual(['case_c1', 'case_c2', 'default']);
  });

  it('com todos os caminhos ligados, passa', () => {
    expect(validateGraph(completo)).toEqual([]);
  });

  /** Sem valor nenhum, todo mundo cai no padrão: o bloco está ali sem separar nada. */
  it('escolha sem valor nenhum é recusada', () => {
    const vazia = {
      nodes: [gatilho, { ...escolha, config: { field: 'mensagem.texto', cases: [] } }, fim],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 's1' },
        { id: 'e2', from: 's1', port: 'default', to: 'f1' },
      ],
    } as AutomationGraph;
    expect(validateGraph(vazia)).toContain('escolha_sem_valores');
  });

  it('caso sem caminho é recusado — o valor existe e não leva a lugar nenhum', () => {
    const semUm = { ...completo, edges: completo.edges.filter((e) => e.port !== 'case_c2') };
    expect(validateGraph(semUm)).toContain('escolha_incompleta');
  });

  it('padrão sem caminho é recusado: o que não casa com nada precisa ir para algum lugar', () => {
    const semPadrao = { ...completo, edges: completo.edges.filter((e) => e.port !== 'default') };
    expect(validateGraph(semPadrao)).toContain('escolha_incompleta');
  });

  /** Valor apagado no editor: a ligação que sobrou aponta para uma saída que não existe mais. */
  it('ligação de um valor que não existe mais é porta inválida', () => {
    const semCaso = {
      ...completo,
      nodes: [
        gatilho,
        { ...escolha, config: { field: 'mensagem.texto', cases: [{ id: 'c1', value: 'preço' }] } },
        fim,
      ],
    } as AutomationGraph;
    expect(validateGraph(semCaso)).toContain('porta_invalida');
  });

  it('a escolha quebra ciclo? não: sem espera, o ciclo continua proibido', () => {
    const emCiclo = {
      nodes: [gatilho, escolha],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 's1' },
        { id: 'e2', from: 's1', port: 'case_c1', to: 's1' },
        { id: 'e3', from: 's1', port: 'case_c2', to: 's1' },
        { id: 'e4', from: 's1', port: 'default', to: 's1' },
      ],
    } as AutomationGraph;
    expect(validateGraph(emCiclo)).toContain('ciclo_sem_espera');
  });
});

/**
 * AU-14 — o bloco de gatilho precisa ser um gatilho que existe.
 *
 * Com o gatilho virando bloco do quadro, o `type` dele deixou de passar por uma lista fechada
 * na borda HTTP. A lista continua existindo — só mudou de lugar, para onde ela vale para
 * qualquer caminho: um gatilho inventado é uma automação que nunca dispara, e ninguém
 * descobre por quê.
 */
describe('AU-14: o tipo do gatilho', () => {
  it('gatilho que não existe é recusado', () => {
    const inventado: AutomationGraph = {
      nodes: [{ ...gatilho, type: 'quando_der_vontade' }, fim],
      edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
    };
    expect(validateGraph(inventado)).toContain('gatilho_desconhecido');
  });

  it('todos os gatilhos do catálogo passam', () => {
    for (const tipo of TRIGGER_TYPES) {
      const graph: AutomationGraph = {
        nodes: [
          // AU-17: o de tempo em tempo é o único que exige configuração para ser válido.
          { ...gatilho, type: tipo, config: { amount: 1, unit: 'hours' } },
          fim,
        ],
        edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
      };
      expect(validateGraph(graph), `gatilho ${tipo}`).toEqual([]);
    }
  });
});

/**
 * AU-17 — o intervalo do gatilho de tempo tem o mesmo piso da espera, e pela mesma razão.
 *
 * A varredura de rede passa de sessenta em sessenta segundos. "A cada trinta segundos" não
 * seria respeitado: a automação faria coisa diferente do que a tela mostra, e recusar é mais
 * honesto que arredondar em silêncio.
 */
describe('AU-17: intervalo do gatilho de tempo', () => {
  const cada = (config: Record<string, unknown>): AutomationGraph => ({
    nodes: [{ ...gatilho, type: 'recurring', config }, fim],
    edges: [{ id: 'e1', from: 'g1', port: 'next', to: 'f1' }],
  });

  it('meio minuto é recusado', () => {
    expect(validateGraph(cada({ amount: 0.5, unit: 'minutes' }))).toContain('intervalo_curto');
  });

  it('sem intervalo nenhum é recusado — não é "de tempos em tempos", é engano', () => {
    expect(validateGraph(cada({}))).toContain('intervalo_curto');
  });

  it('um minuto passa: é o piso, não o proibido', () => {
    expect(validateGraph(cada({ amount: 1, unit: 'minutes' }))).toEqual([]);
  });

  it('seis horas passa', () => {
    expect(validateGraph(cada({ amount: 6, unit: 'hours' }))).toEqual([]);
  });

  /** O piso é do gatilho de tempo: os outros não têm intervalo para conferir. */
  it('gatilho de outro tipo sem intervalo passa', () => {
    expect(validateGraph(cada({}).nodes[0]?.type === 'recurring' ? simples : simples)).toEqual([]);
  });
});

/**
 * AU-18 · AU-20 — o bloco que percorre uma lista.
 *
 * Ele não busca: percorre o que uma busca guardou. Duas regras o cercam — precisa levar a algum
 * lugar (percorrer sem fluxo depois é abrir execução à toa) e não pode haver dois, porque um
 * dentro do outro multiplica execução, e o teto por hora descobriria isso tarde demais.
 */
describe('AU-18: o bloco para cada', () => {
  const guarda = {
    id: 'b1',
    kind: 'lookup',
    type: 'find_one',
    config: { entity: 'customers', filters: [], mode: 'all', as: 'resultado' },
    position: { x: 0, y: 60 },
  } as const;
  const percorre = {
    id: 'p1',
    kind: 'forEach',
    type: 'for_each',
    config: { list: 'resultado', limit: 10 },
    position: { x: 0, y: 120 },
  } as const;

  const daBusca = [
    { id: 'e1', from: 'g1', port: 'true' as const, to: 'p1' },
    { id: 'e2', from: 'b1', port: 'false' as const, to: 'f1' },
  ];

  const comPercurso = (edges: AutomationGraph['edges']): AutomationGraph => ({
    nodes: [gatilho, guarda, percorre, fim],
    edges,
  });

  it('com caminho depois dele, passa', () => {
    const graph = comPercurso([
      { id: 'e1', from: 'g1', port: 'next', to: 'b1' },
      { id: 'e2', from: 'b1', port: 'true', to: 'p1' },
      { id: 'e3', from: 'b1', port: 'false', to: 'f1' },
      { id: 'e4', from: 'p1', port: 'next', to: 'f1' },
    ]);
    expect(validateGraph(graph)).toEqual([]);
  });

  it('percorrer sem fluxo depois é recusado', () => {
    const graph: AutomationGraph = {
      nodes: [gatilho, guarda, percorre, fim],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'b1' },
        { id: 'e2', from: 'b1', port: 'true', to: 'p1' },
        { id: 'e3', from: 'b1', port: 'false', to: 'f1' },
      ],
    };
    expect(validateGraph(graph)).toContain('busca_sem_caminho');
  });

  it('dois no mesmo desenho são recusados', () => {
    const graph: AutomationGraph = {
      nodes: [gatilho, guarda, percorre, { ...percorre, id: 'p2' }, fim],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'b1' },
        { id: 'e2', from: 'b1', port: 'true', to: 'p1' },
        { id: 'e3', from: 'b1', port: 'false', to: 'f1' },
        { id: 'e4', from: 'p1', port: 'next', to: 'p2' },
        { id: 'e5', from: 'p2', port: 'next', to: 'f1' },
      ],
    };
    expect(validateGraph(graph)).toContain('busca_duplicada');
  });

  it('tem uma saída só, e ela quer dizer "para cada item, siga daqui"', () => {
    expect(portsOf(percorre)).toEqual(['next']);
    expect(daBusca.length).toBe(2);
  });
});

/**
 * AU-19 — o bloco que **traz** um item para o contexto.
 *
 * O caso que o pediu: "o lead mandou mensagem; se não existe cartão dele no funil, crie". O
 * gatilho traz a conversa e o contato, e nada do funil — sem um bloco que vá buscar, a
 * pergunta não tem como ser feita.
 *
 * Duas saídas, como a condição, e pela mesma razão: "não achou" é um caminho tão legítimo
 * quanto "achou", e é justamente nele que mora o "então crie".
 */
describe('AU-19: o bloco de buscar um', () => {
  const busca = {
    id: 'b1',
    kind: 'lookup',
    type: 'find_one',
    config: { entity: 'opportunities', filters: [] },
    position: { x: 0, y: 60 },
  } as const;

  it('tem as saídas de achou e não achou', () => {
    expect(portsOf(busca)).toEqual(['true', 'false']);
  });

  it('com os dois caminhos ligados, passa', () => {
    const graph: AutomationGraph = {
      nodes: [gatilho, busca, fim],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'b1' },
        { id: 'e2', from: 'b1', port: 'true', to: 'f1' },
        { id: 'e3', from: 'b1', port: 'false', to: 'f1' },
      ],
    };
    expect(validateGraph(graph)).toEqual([]);
  });

  /** Um lado só é armadilha: o outro caminho existe na cabeça de quem desenhou, e não no fluxo. */
  it('sem o caminho de não achou, é recusado', () => {
    const graph: AutomationGraph = {
      nodes: [gatilho, busca, fim],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'b1' },
        { id: 'e2', from: 'b1', port: 'true', to: 'f1' },
      ],
    };
    expect(validateGraph(graph)).toContain('busca_um_incompleta');
  });

  /** Diferente do "para cada": buscar um não semeia nada, então dois no fluxo são legítimos. */
  it('duas buscas de um item no mesmo desenho passam', () => {
    const graph: AutomationGraph = {
      nodes: [gatilho, busca, { ...busca, id: 'b2' }, fim],
      edges: [
        { id: 'e1', from: 'g1', port: 'next', to: 'b1' },
        { id: 'e2', from: 'b1', port: 'true', to: 'b2' },
        { id: 'e3', from: 'b1', port: 'false', to: 'b2' },
        { id: 'e4', from: 'b2', port: 'true', to: 'f1' },
        { id: 'e5', from: 'b2', port: 'false', to: 'f1' },
      ],
    };
    expect(validateGraph(graph)).toEqual([]);
  });
});

/**
 * AU-20 — o "para cada" percorre a lista que uma busca guardou, e o nome precisa existir.
 *
 * Errar o nome não daria erro nenhum: a lista não existe, zero itens são semeados, e o fluxo
 * termina como se não houvesse ninguém para agir. É o pior tipo de defeito — o que parece
 * funcionar. Recusar ao salvar transforma isso numa frase na tela.
 */
describe('AU-20: o para cada aponta para uma lista que existe', () => {
  const busca = (as: string) => ({
    id: 'b1',
    kind: 'lookup' as const,
    type: 'find_one',
    config: { entity: 'customers', filters: [], mode: 'all', as },
    position: { x: 0, y: 60 },
  });
  const percorre = (list: string) => ({
    id: 'p1',
    kind: 'forEach' as const,
    type: 'for_each',
    config: { list, limit: 10 },
    position: { x: 0, y: 120 },
  });
  const ligacoes = [
    { id: 'e1', from: 'g1', port: 'next' as const, to: 'b1' },
    { id: 'e2', from: 'b1', port: 'true' as const, to: 'p1' },
    { id: 'e3', from: 'b1', port: 'false' as const, to: 'f1' },
    { id: 'e4', from: 'p1', port: 'next' as const, to: 'f1' },
  ];

  it('nome que casa com o da busca passa', () => {
    const graph: AutomationGraph = {
      nodes: [gatilho, busca('clientes'), percorre('clientes'), fim],
      edges: ligacoes,
    };
    expect(validateGraph(graph)).toEqual([]);
  });

  it('nome que nenhuma busca guarda é recusado', () => {
    const graph: AutomationGraph = {
      nodes: [gatilho, busca('clientes'), percorre('cartoes'), fim],
      edges: ligacoes,
    };
    expect(validateGraph(graph)).toContain('lista_sem_origem');
  });

  /** Busca que traz **o primeiro** não guarda lista nenhuma: não serve de origem. */
  it('busca em modo primeiro não serve de origem para o para cada', () => {
    const graph: AutomationGraph = {
      nodes: [
        gatilho,
        { ...busca('clientes'), config: { entity: 'customers', filters: [], mode: 'first' } },
        percorre('clientes'),
        fim,
      ],
      edges: ligacoes,
    };
    expect(validateGraph(graph)).toContain('lista_sem_origem');
  });
});
