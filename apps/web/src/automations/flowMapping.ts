import type { AutomationEdge, AutomationGraph, AutomationNode, Port } from '@expedition/domain';

/**
 * AU-01 — a tradução entre o nosso grafo e o formato do quadro.
 *
 * É a fronteira com a única dependência de interface do projeto, e por isso vive numa função
 * pura com teste: o que se perde numa tradução dessas some **em silêncio** — a posição de um
 * bloco, a saída de uma condição —, e o sintoma aparece depois de salvar, quando o desenho
 * volta diferente do que a pessoa deixou.
 *
 * A espécie do bloco (`kind`) vira o tipo de nó, porque é ela que decide como o bloco é
 * desenhado e quantas saídas tem. O `type` fica no dado, junto da configuração.
 */

export interface FlowNode {
  readonly id: string;
  readonly type: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly data: { readonly type: string; readonly config: Record<string, unknown> };
}

export interface FlowEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourceHandle?: string | null;
}

export function toFlow(graph: AutomationGraph): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return {
    nodes: graph.nodes.map((no) => ({
      id: no.id,
      type: no.kind,
      position: { x: no.position.x, y: no.position.y },
      data: { type: no.type, config: no.config },
    })),
    edges: graph.edges.map((ligacao) => ({
      id: ligacao.id,
      source: ligacao.from,
      target: ligacao.to,
      // A porta vira a alça de saída: sem isso os dois lados de uma condição viram um só.
      sourceHandle: ligacao.port,
    })),
  };
}

export function fromFlow(nodes: readonly FlowNode[], edges: readonly FlowEdge[]): AutomationGraph {
  return {
    nodes: nodes.map((no): AutomationNode => ({
      id: no.id,
      kind: no.type as AutomationNode['kind'],
      type: no.data.type,
      config: no.data.config,
      // Meio pixel guardado não ajuda ninguém, e enche o diff de mudança que não é mudança.
      position: { x: Math.round(no.position.x), y: Math.round(no.position.y) },
    })),
    edges: edges.map((ligacao): AutomationEdge => ({
      id: ligacao.id,
      from: ligacao.source,
      // Bloco de uma saída só não declara alça; a porta padrão é a única que ele tem.
      port: (ligacao.sourceHandle ?? 'next') as Port,
      to: ligacao.target,
    })),
  };
}
