import { describe, expect, it } from 'vitest';
import {
  assinaturaDoGrafo,
  ensaioAtual,
  podeEnsaiar,
  porBloco,
  porqueNaoChegou,
  type PassoEnsaiado,
} from './simulacao.js';
import type { AutomationGraph } from '@expedition/domain';

function passo(nodeId: string, outcome: string): PassoEnsaiado {
  return {
    nodeId,
    kind: 'action',
    type: 'send_message',
    outcome,
    detail: {},
    input: {},
    output: {},
  };
}

describe('AU-27: os passos do ensaio indexados por bloco', () => {
  it('acha o passo de cada bloco', () => {
    const mapa = porBloco([passo('a1', 'faria'), passo('a2', 'faria')]);
    expect(mapa.get('a2')?.outcome).toBe('faria');
  });

  it('bloco que o ensaio não alcançou não tem passo — é o ramo que não foi tomado', () => {
    expect(porBloco([passo('a1', 'faria')]).has('a2')).toBe(false);
  });

  it('bloco visitado duas vezes fica com a primeira passagem', () => {
    const mapa = porBloco([passo('a1', 'primeira'), passo('a1', 'segunda')]);
    expect(mapa.get('a1')?.outcome).toBe('primeira');
  });
});

/**
 * AU-27 — o ensaio vale para o desenho que o produziu, e para nenhum outro.
 *
 * Sem isto, mexer num campo e olhar o bloco mostrava o resultado do desenho **anterior**, sem
 * nada dizendo que era velho. É o pior defeito que uma tela de explicação pode ter: não é
 * ausência de resposta, é resposta errada com cara de certa — a pessoa conclui sobre a mudança
 * que acabou de fazer olhando o que havia antes dela.
 *
 * Arrastar bloco é a razão de a assinatura ignorar posição: quem organiza o quadro não mudou
 * pergunta nenhuma, e invalidar ali faria o ensaio sumir toda vez que alguém arruma o desenho.
 */
describe('AU-27: o ensaio pertence ao desenho que o produziu', () => {
  const desenho = (config: Record<string, unknown>, comLigacao = true): AutomationGraph => ({
    nodes: [
      { id: 'g1', kind: 'trigger', type: 'message_received', config: {}, position: { x: 0, y: 0 } },
      { id: 'a1', kind: 'action', type: 'send_message', config, position: { x: 0, y: 90 } },
    ],
    edges: comLigacao ? [{ id: 'e1', from: 'g1', port: 'next', to: 'a1' }] : [],
  });

  it('mover um bloco não invalida: arrumar o quadro não muda pergunta nenhuma', () => {
    const antes = desenho({ text: 'Oi' });
    const movido: AutomationGraph = {
      ...antes,
      nodes: antes.nodes.map((no) => ({ ...no, position: { x: no.position.x + 240, y: 300 } })),
    };

    expect(assinaturaDoGrafo(movido)).toBe(assinaturaDoGrafo(antes));
  });

  it('mudar um campo invalida: é outra pergunta', () => {
    expect(assinaturaDoGrafo(desenho({ text: 'Oi' }))).not.toBe(
      assinaturaDoGrafo(desenho({ text: 'Olá' })),
    );
  });

  it('tirar uma ligação invalida: o fluxo passa a correr por outro caminho', () => {
    expect(assinaturaDoGrafo(desenho({ text: 'Oi' }, false))).not.toBe(
      assinaturaDoGrafo(desenho({ text: 'Oi' })),
    );
  });
});

describe('AU-27: o ensaio que a tela mostra', () => {
  const grafo: AutomationGraph = {
    nodes: [
      { id: 'g1', kind: 'trigger', type: 'message_received', config: {}, position: { x: 0, y: 0 } },
    ],
    edges: [],
  };
  const guardado = {
    assinatura: assinaturaDoGrafo(grafo),
    mapa: porBloco([passo('g1', 'disparou')]),
  };

  it('vale enquanto o desenho for o mesmo', () => {
    expect(ensaioAtual(guardado, assinaturaDoGrafo(grafo))?.get('g1')?.outcome).toBe('disparou');
  });

  it('desenho mudou: some, em vez de mostrar o de antes', () => {
    expect(ensaioAtual(guardado, 'outra-assinatura')).toBeNull();
  });

  /**
   * Mudar e desfazer devolve o ensaio. É consequência de a validade ser **derivada** do
   * desenho, e não apagada por um efeito quando alguém digita: o desenho voltou a ser o mesmo,
   * então a resposta volta a valer.
   */
  it('desfazer a mudança devolve o ensaio', () => {
    const outro = assinaturaDoGrafo({
      ...grafo,
      nodes: [{ ...grafo.nodes[0]!, config: { a: 1 } }],
    });
    expect(ensaioAtual(guardado, outro)).toBeNull();
    expect(ensaioAtual(guardado, assinaturaDoGrafo(grafo))).not.toBeNull();
  });

  it('sem ensaio nenhum, não há o que mostrar', () => {
    expect(ensaioAtual(null, assinaturaDoGrafo(grafo))).toBeNull();
  });
});

/**
 * AU-25 — quem pode ensaiar.
 *
 * O caso de uso pede `requireTeam`, que **inclui o viewer**: ensaiar não muda nada e não manda
 * nada, então quem pode ler o quadro pode percorrê-lo. A tela dizia "é de owner ou admin",
 * que é outra regra e não é a que o servidor aplica — descobrir isso por um 403 depois de
 * preencher um formulário é o pior jeito de aprender uma permissão.
 */
describe('AU-25: ensaiar é de quem é da equipe', () => {
  it.each(['owner', 'admin', 'operator', 'viewer'])('%s ensaia', (papel) => {
    expect(podeEnsaiar(papel)).toBe(true);
  });

  it('o cliente não ensaia: o quadro não é dele', () => {
    expect(podeEnsaiar('customer')).toBe(false);
  });

  it('sem papel nenhum, não', () => {
    expect(podeEnsaiar(null)).toBe(false);
  });
});

/**
 * AU-27 — por que o ensaio não chegou neste bloco.
 *
 * O painel dizia "este ramo não foi tomado" e parava aí. É verdade e não serve para nada: quem
 * abriu o bloco quer saber **qual** decisão mandou o fluxo para o outro lado, e com que valor —
 * senão a única saída é ler o desenho inteiro de cabeça, procurando o desvio.
 *
 * A resposta está toda nos passos que já vieram: a condição guarda a porta por onde saiu e o
 * valor que leu. Não precisa de servidor nenhum.
 */
describe('AU-27: por que o fluxo não chegou aqui', () => {
  const grafo: AutomationGraph = {
    nodes: [
      { id: 'g1', kind: 'trigger', type: 'message_received', config: {}, position: { x: 0, y: 0 } },
      { id: 'c1', kind: 'condition', type: 'field', config: {}, position: { x: 0, y: 60 } },
      { id: 'sim', kind: 'action', type: 'send_message', config: {}, position: { x: 0, y: 120 } },
      { id: 'nao', kind: 'action', type: 'send_message', config: {}, position: { x: 200, y: 120 } },
    ],
    edges: [
      { id: 'e1', from: 'g1', port: 'next', to: 'c1' },
      { id: 'e2', from: 'c1', port: 'true', to: 'sim' },
      { id: 'e3', from: 'c1', port: 'false', to: 'nao' },
    ],
  };

  /** O ensaio saiu pelo `false`: passou pelo gatilho, pela condição, e foi para o "não". */
  const passos = [
    passo('g1', 'disparou'),
    {
      ...passo('c1', 'false'),
      kind: 'condition',
      type: 'field',
      detail: { campo: 'mensagem.texto', valor: 'oi' },
    },
    passo('nao', 'faria'),
  ];

  it('aponta a condição que desviou, a porta e o valor que ela leu', () => {
    expect(porqueNaoChegou(passos, grafo, 'sim')).toEqual({
      nodeId: 'c1',
      porta: 'false',
      campo: 'mensagem.texto',
      valor: 'oi',
    });
  });

  it('bloco que o ensaio percorreu não tem por que explicar', () => {
    expect(porqueNaoChegou(passos, grafo, 'nao')).toBeNull();
  });

  /**
   * Um bloco solto no quadro não deixou de ser alcançado por causa de decisão nenhuma: nada o
   * liga ao fluxo. Culpar o "Se" aqui mandaria a pessoa mexer na condição em vez de ligar o
   * bloco, que é o conserto de verdade.
   */
  it('bloco que ninguém liga não tem condição para culpar', () => {
    const solto: AutomationGraph = {
      nodes: [
        ...grafo.nodes,
        { id: 'x1', kind: 'end', type: 'end', config: {}, position: { x: 400, y: 0 } },
      ],
      edges: grafo.edges,
    };
    expect(porqueNaoChegou(passos, solto, 'x1')).toBeNull();
  });

  it('sem ensaio nenhum não há o que explicar', () => {
    expect(porqueNaoChegou([], grafo, 'sim')).toBeNull();
  });
});
