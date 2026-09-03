import { createContext, useContext } from 'react';
import { Handle, Position, useNodes, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { CATALOGO_DE_BUSCA, searchEntityOf, searchFilters, switchCases } from '@expedition/domain';
import { blockLabel, saidasDe } from './blocks.js';
import { camposDisponiveis } from './fields.js';
import { BlockFields } from './BlockFields.js';
import type { NodeKind } from '@expedition/domain';

/**
 * AU-01 · AU-16 — o bloco no quadro, com a configuração dentro dele.
 *
 * O cartão fechado mostra o que o bloco faz, numa linha, para o fluxo inteiro ser legível sem
 * abrir nada. **Selecionado, ele abre os campos ali mesmo** — sem coluna lateral, sem viagem do
 * olho entre o bloco e um formulário longe dele.
 *
 * A cor da borda é de **interface**: `--o` marca o bloco selecionado, nada mais. Verde e
 * vermelho não entram aqui; neste sistema eles significam dinheiro.
 */

export type BlockData = { type: string; config: Record<string, unknown> };
export type BlockNodeType = Node<BlockData, NodeKind>;

/**
 * O quadro só de leitura chega aos blocos por contexto, e não por `data`: é estado da tela
 * inteira, e copiá-lo em cada nó faria "automação ligada" virar dezoito verdades que podem
 * discordar entre si.
 */
export const QuadroContext = createContext<{ readOnly: boolean }>({ readOnly: false });

const ESPECIE: Record<NodeKind, string> = {
  trigger: 'quando',
  condition: 'se',
  switch: 'conforme',
  forEach: 'para cada',
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
  const { readOnly } = useContext(QuadroContext);
  const { updateNodeData, setNodes, setEdges } = useReactFlow<BlockNodeType>();
  // AU-16: metade dos campos vem do gatilho e metade do próprio desenho — por isso o bloco
  // pergunta ao quadro, e não a si mesmo.
  const campos = camposDisponiveis(useNodes<BlockNodeType>());

  const mudarConfig = (config: Record<string, unknown>) => {
    updateNodeData(id, { config });
    /*
     * AU-15 — apagar um valor da escolha múltipla apaga a saída dele, e a ligação que saía
     * dali deixa de ter porta. Limpar aqui é o que evita salvar um desenho com ligação
     * pendurada numa saída que não existe mais: recusado no servidor, e sem nada no quadro
     * explicando por quê.
     */
    const portas = new Set(saidasDe(kind, config).map((saida) => saida.port));
    setEdges((atuais) =>
      atuais.filter((e) => e.source !== id || portas.has(e.sourceHandle ?? 'next')),
    );
  };

  const remover = () => {
    setNodes((atuais) => atuais.filter((n) => n.id !== id));
    setEdges((atuais) => atuais.filter((e) => e.source !== id && e.target !== id));
  };

  return (
    <div
      className={`auto-node auto-node-${kind}${selected ? ' is-selected' : ''}`}
      // AU-15: a escolha múltipla cresce com o número de valores. Sem largura por saída, as
      // alças se amontoam e ligar no caminho certo vira sorte.
      style={saidas.length > 2 && !selected ? { width: `${String(saidas.length * 96)}px` } : {}}
    >
      {kind !== 'trigger' && <Handle type="target" position={Position.Top} />}

      <span className="auto-node-kind">{ESPECIE[kind]}</span>
      <span className="auto-node-label">{blockLabel(data.type)}</span>
      {!selected && resumo(data) !== '' && <span className="auto-node-sub">{resumo(data)}</span>}

      {selected && (
        <>
          <BlockFields
            type={data.type}
            config={data.config}
            campos={campos}
            readOnly={readOnly}
            onChange={mudarConfig}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-danger nodrag auto-node-remove"
            disabled={readOnly}
            onClick={remover}
          >
            Remover bloco
          </button>
        </>
      )}

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
    if (dias === 0) return 'no dia da saída';
    return dias < 0 ? `${String(-dias)} dias antes` : `${String(dias)} dias depois`;
  }
  if (data.type === 'for_each') {
    const entidade = searchEntityOf(c);
    if (entidade === null) return '';
    const quantos = searchFilters(c).filter((filtro) => filtro.field !== '').length;
    const filtro = quantos === 0 ? 'a lista inteira' : `${String(quantos)} filtro(s)`;
    return `${CATALOGO_DE_BUSCA[entidade].label} · ${filtro}`;
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
  setVariable: BlockNode,
  delay: BlockNode,
  action: BlockNode,
  end: BlockNode,
};
