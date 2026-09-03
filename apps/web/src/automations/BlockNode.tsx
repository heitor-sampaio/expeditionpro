import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { switchCases } from '@expedition/domain';
import { blockLabel, saidasDe } from './blocks.js';
import type { NodeKind } from '@expedition/domain';

/**
 * AU-01 — o desenho de um bloco no quadro.
 *
 * Um bloco só por espécie: o mesmo cartão, com as alças que a espécie tem. Condição mostra
 * duas saídas rotuladas ("sim" e "não"), porque a diferença entre elas é a coisa mais fácil
 * de errar num fluxo — e o erro só aparece quando a automação já respondeu errado a alguém.
 *
 * A cor da borda é de **interface**: `--o` marca o bloco selecionado, nada mais. Verde e
 * vermelho não entram aqui; neste sistema eles significam dinheiro.
 */

export type BlockData = { type: string; config: Record<string, unknown> };
export type BlockNodeType = Node<BlockData, NodeKind>;

const ESPECIE: Record<NodeKind, string> = {
  trigger: 'quando',
  condition: 'se',
  switch: 'conforme',
  setVariable: 'variável',
  delay: 'espera',
  action: 'faz',
  end: 'fim',
};

export function BlockNode({ data, type, selected }: NodeProps<BlockNodeType>): React.JSX.Element {
  const kind = (type ?? 'action') as NodeKind;
  const saidas = saidasDe(kind, data.config);

  return (
    <div
      className={`auto-node auto-node-${kind}${selected ? ' is-selected' : ''}`}
      // AU-15: a escolha múltipla cresce com o número de valores. Sem largura por saída, as
      // alças se amontoam e ligar no caminho certo vira sorte.
      style={saidas.length > 2 ? { width: `${String(saidas.length * 84)}px` } : undefined}
    >
      {kind !== 'trigger' && <Handle type="target" position={Position.Top} />}

      <span className="auto-node-kind">{ESPECIE[kind]}</span>
      <span className="auto-node-label">{blockLabel(data.type)}</span>
      {resumo(data) && <span className="auto-node-sub">{resumo(data)}</span>}

      {saidas.map((saida, i) => (
        <Handle
          key={saida.port}
          type="source"
          id={saida.port}
          position={Position.Bottom}
          // Duas ou mais saídas se dividem a base do bloco; uma só fica no meio, onde o padrão
          // a põe.
          style={saidas.length > 1 ? { left: `${(i + 1) * (100 / (saidas.length + 1))}%` } : {}}
        >
          {saida.label && <span className="auto-node-port">{saida.label}</span>}
        </Handle>
      ))}
    </div>
  );
}

/**
 * Uma linha do que o bloco está configurado para fazer. É o que permite ler o fluxo inteiro
 * sem abrir bloco por bloco — sem isso, um quadro com dez ações vira dez cartões idênticos.
 */
function resumo(data: BlockData): string {
  const c = data.config;
  const texto = (chave: string): string => (typeof c[chave] === 'string' ? c[chave] : '');

  if (data.type === 'wait') {
    const quanto = typeof c['amount'] === 'number' ? c['amount'] : Number(c['amount'] ?? 0);
    const unidade = UNIDADE[texto('unit')] ?? '';
    return quanto > 0 ? `${quanto} ${unidade}` : '';
  }
  if (data.type === 'field') {
    const campo = texto('field');
    return campo === '' ? '' : `${campo} ${OPERADOR[texto('operator')] ?? ''} ${texto('value')}`;
  }
  if (data.type === 'match') {
    const campo = texto('field');
    const quantos = switchCases(c).length;
    return campo === ''
      ? ''
      : `${campo} · ${String(quantos)} ${quantos === 1 ? 'valor' : 'valores'}`;
  }
  if (data.type === 'set') {
    const nome = texto('name');
    return nome === '' ? '' : `${nome} = ${texto('value')}`;
  }
  if (data.type === 'move_opportunity') return texto('stageName');
  return corta(texto('text') || texto('contactName'));
}

function corta(texto: string): string {
  return texto.length > 46 ? `${texto.slice(0, 46)}…` : texto;
}

const UNIDADE: Record<string, string> = {
  minutes: 'minutos',
  hours: 'horas',
  days: 'dias',
};

const OPERADOR: Record<string, string> = {
  contains: 'contém',
  equals: '=',
  not_equals: '≠',
  empty: 'está vazio',
  not_empty: 'não está vazio',
};

/** Um componente por espécie, porque é o que a biblioteca do quadro espera na chave. */
export const NODE_TYPES = {
  trigger: BlockNode,
  condition: BlockNode,
  switch: BlockNode,
  setVariable: BlockNode,
  delay: BlockNode,
  action: BlockNode,
  end: BlockNode,
};
