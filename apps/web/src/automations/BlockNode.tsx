import { createContext, useContext } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  CATALOGO_DE_BUSCA,
  iteratedList,
  listName,
  searchEntityOf,
  searchFilters,
  searchMode,
  switchCases,
} from '@expedition/domain';
import { blockLabel, saidasDe } from './blocks.js';
import type { NodeKind } from '@expedition/domain';

/**
 * AU-01 · AU-16 — o bloco no quadro: o cartão que se lê de relance.
 *
 * Ele mostra o que o bloco faz numa linha, para o fluxo inteiro ser legível sem abrir nada. A
 * configuração vive no painel (AU-27), e não aqui dentro: enquanto morava no nó, ela era
 * desenhada pelo transform do quadro e, com zoom, ficava ilegível justamente quando o fluxo
 * era grande o bastante para precisar de zoom.
 *
 * A cor da borda é de **interface**: `--o` marca o bloco selecionado, nada mais. Verde e
 * vermelho não entram aqui; neste sistema eles significam dinheiro.
 */

export type BlockData = { type: string; config: Record<string, unknown> };
export type BlockNodeType = Node<BlockData, NodeKind>;

/**
 * O que é da tela inteira chega aos blocos por contexto, e não por `data`: copiá-lo em cada nó
 * faria "automação ligada" virar dezoito verdades que podem discordar entre si.
 */
export const QuadroContext = createContext<{
  readonly readOnly: boolean;
  /** AU-27 — pede ao editor que abra este bloco no painel. */
  readonly abrir: (nodeId: string) => void;
}>({ readOnly: false, abrir: () => undefined });

const ESPECIE: Record<NodeKind, string> = {
  trigger: 'quando',
  condition: 'se',
  switch: 'conforme',
  forEach: 'para cada',
  lookup: 'busca',
  setVariable: 'variável',
  delay: 'espera',
  action: 'faz',
  end: 'fim',
};

export function BlockNode({
  id,
  data,
  type,
  selected,
}: NodeProps<BlockNodeType>): React.JSX.Element {
  const kind = (type ?? 'action') as NodeKind;
  const saidas = saidasDe(kind, data.config);
  const { abrir } = useContext(QuadroContext);
  return (
    <div
      className={`auto-node auto-node-${kind}${selected ? ' is-selected' : ''}${
        data.config['disabled'] === true ? ' is-off' : ''
      }`}
      // AU-15: a escolha múltipla cresce com o número de valores. Sem largura por saída, as
      // alças se amontoam e ligar no caminho certo vira sorte.
      style={saidas.length > 2 && !selected ? { width: `${String(saidas.length * 96)}px` } : {}}
    >
      {kind !== 'trigger' && <Handle type="target" position={Position.Top} />}

      <span className="auto-node-kind">{ESPECIE[kind]}</span>
      <span className="auto-node-label">{blockLabel(data.type)}</span>
      {resumo(data) !== '' && <span className="auto-node-sub">{resumo(data)}</span>}

      {/*
       * AU-27 — abrir é gesto próprio, e não consequência de selecionar.
       *
       * O duplo clique no bloco faz o mesmo e é o gesto de quem já usou editor de fluxo; este
       * botão existe para quem não o descobre — gesto sem porta visível é gesto que metade das
       * pessoas nunca encontra.
       */}
      <button type="button" className="btn btn-secondary btn-sm nodrag" onClick={() => abrir(id)}>
        Abrir
      </button>

      {saidas.map((saida, i) => (
        <Handle
          key={saida.port}
          type="source"
          id={saida.port}
          // Cor é dado: a saída de erro em vermelho, como todo o resto do que deu errado.
          className={saida.port === 'error' ? 'auto-handle-erro' : undefined}
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

  if (data.type === 'wait' || data.type === 'recurring') {
    const quanto = typeof c['amount'] === 'number' ? c['amount'] : Number(c['amount'] ?? 0);
    const unidade = UNIDADE[texto('unit')] ?? '';
    if (quanto <= 0) return '';
    return data.type === 'wait' ? `${quanto} ${unidade}` : `a cada ${quanto} ${unidade}`;
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
  if (data.type === 'scheduled') {
    const dias = Number(c['offsetDays'] ?? 0);
    if (dias === 0) return 'no dia do grupo';
    return dias < 0 ? `${String(-dias)} dias antes` : `${String(dias)} dias depois`;
  }
  if (data.type === 'find_one') {
    const entidade = searchEntityOf(c);
    if (entidade === null) return '';
    const quantos = searchFilters(c).filter((filtro) => filtro.field !== '').length;
    const modo = searchMode(c) === 'all' ? `todos → ${listName(c)}` : 'o primeiro';
    const filtro = quantos === 0 ? '' : ` · ${String(quantos)} filtro(s)`;
    return `${CATALOGO_DE_BUSCA[entidade].label} · ${modo}${filtro}`;
  }
  if (data.type === 'for_each') return iteratedList(c);
  if (data.type === 'run_code') {
    // O código não cabe no cartão: o que interessa de relance é onde a resposta vai parar.
    const guardar = texto('saveAs').trim();
    return guardar === '' ? 'só no log' : `→ ${guardar}`;
  }
  if (data.type === 'http_request') {
    const metodo = texto('method') || 'POST';
    return corta(`${metodo} ${texto('url')}`);
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
  forEach: BlockNode,
  lookup: BlockNode,
  setVariable: BlockNode,
  delay: BlockNode,
  action: BlockNode,
  end: BlockNode,
};
