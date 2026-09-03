import { describe, expect, it } from 'vitest';
import { fromFlow, toFlow } from './flowMapping.js';
import type { AutomationGraph } from '@expedition/domain';

/**
 * AU-01 — a tradução entre o nosso grafo e o formato da biblioteca do quadro.
 *
 * É a fronteira com a única dependência de interface do projeto, e por isso ela é uma função
 * pura com teste: o que se perde numa tradução dessas some **em silêncio** — a posição de um
 * bloco, a saída de uma condição —, e o sintoma aparece depois de salvar, quando o desenho
 * volta diferente do que a pessoa deixou.
 *
 * A regra que fecha o assunto: traduzir para lá e de volta devolve o mesmo grafo.
 */

const grafo: AutomationGraph = {
  nodes: [
    {
      id: 'g1',
      kind: 'trigger',
      type: 'message_received',
      config: {},
      position: { x: 40, y: 80 },
    },
    {
      id: 'c1',
      kind: 'condition',
      type: 'field',
      config: { field: 'mensagem.texto', operator: 'contains', value: 'preço' },
      position: { x: 40, y: 200 },
    },
    {
      id: 'a1',
      kind: 'action',
      type: 'send_message',
      config: { text: 'Bom dia!' },
      position: { x: 220, y: 320 },
    },
    { id: 'f1', kind: 'end', type: 'end', config: {}, position: { x: 40, y: 320 } },
  ],
  edges: [
    { id: 'e1', from: 'g1', port: 'next', to: 'c1' },
    { id: 'e2', from: 'c1', port: 'true', to: 'a1' },
    { id: 'e3', from: 'c1', port: 'false', to: 'f1' },
  ],
};

describe('AU-01: do grafo para o quadro', () => {
  it('cada bloco vira um nó, com a posição preservada', () => {
    const { nodes } = toFlow(grafo);

    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({ id: 'g1', position: { x: 40, y: 80 } });
  });

  it('a espécie do bloco vira o tipo de nó — é ela que decide o desenho', () => {
    const { nodes } = toFlow(grafo);

    expect(nodes.map((n) => n.type)).toEqual(['trigger', 'condition', 'action', 'end']);
  });

  it('a configuração viaja junto, para o inspetor editar', () => {
    const { nodes } = toFlow(grafo);

    expect(nodes[2]?.data.config).toEqual({ text: 'Bom dia!' });
  });

  /** A porta vira a alça de saída: sem isso, os dois lados da condição viram um só. */
  it('a saída da ligação vira a alça de origem', () => {
    const { edges } = toFlow(grafo);

    expect(edges.map((e) => e.sourceHandle)).toEqual(['next', 'true', 'false']);
  });
});

describe('AU-01: do quadro de volta para o grafo', () => {
  it('ida e volta devolve o mesmo grafo', () => {
    const { nodes, edges } = toFlow(grafo);

    expect(fromFlow(nodes, edges)).toEqual(grafo);
  });

  it('bloco arrastado guarda a posição nova', () => {
    const { nodes, edges } = toFlow(grafo);
    const movido = nodes.map((n) => (n.id === 'a1' ? { ...n, position: { x: 500, y: 600 } } : n));

    const voltou = fromFlow(movido, edges);

    expect(voltou.nodes.find((n) => n.id === 'a1')?.position).toEqual({ x: 500, y: 600 });
  });

  /**
   * A biblioteca deixa a alça de origem vazia quando o bloco só tem uma saída. Sem o padrão,
   * a ligação voltaria sem porta e o motor não saberia por onde seguir.
   */
  it('ligação sem alça declarada volta como saída única', () => {
    const { nodes } = toFlow(grafo);
    const semAlca = [{ id: 'e1', source: 'g1', target: 'c1', sourceHandle: null }];

    expect(fromFlow(nodes, semAlca).edges[0]?.port).toBe('next');
  });

  it('posição fracionada é arredondada — quadro guardado com meio pixel não ajuda ninguém', () => {
    const { nodes, edges } = toFlow(grafo);
    const torto = nodes.map((n) => (n.id === 'g1' ? { ...n, position: { x: 40.7, y: 80.2 } } : n));

    expect(fromFlow(torto, edges).nodes[0]?.position).toEqual({ x: 41, y: 80 });
  });
});
