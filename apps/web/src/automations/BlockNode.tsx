import { createContext, useContext, useState } from 'react';
import { Handle, Position, useNodes, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
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
import { caminhosDe, camposDisponiveis } from './fields.js';
import { BlockFields } from './BlockFields.js';
import type { ContextField, NodeKind } from '@expedition/domain';
import type { PassoEnsaiado } from './simulacao.js';

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
export const QuadroContext = createContext<{
  readonly readOnly: boolean;
  /**
   * AU-27 — o último ensaio, indexado por bloco. `null` enquanto ninguém ensaiou: aí os
   * painéis mostram os campos que *existem*, sem valor, que é a informação possível.
   */
  readonly ensaio: Map<string, PassoEnsaiado> | null;
}>({ readOnly: false, ensaio: null });

/** AU-26 — quem tem uma saída só pode ser pulado; quem separa caminho, não. */
const PODEM_DESLIGAR = new Set<NodeKind>(['action', 'delay', 'setVariable', 'forEach']);

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
  const { readOnly } = useContext(QuadroContext);
  // AU-27: qual campo recebe a variável clicada. Mora no bloco porque é dele o formulário.
  const [foco, setFoco] = useState<string | null>(null);
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

  /*
   * AU-27 — a variável entra no texto por clique, e não por digitação.
   *
   * O campo que recebe é o **último que teve o foco**. Sem isso, clicar na lista da esquerda
   * tiraria o foco do texto e não haveria onde inserir; guardar qual era é o que faz o gesto
   * ser um clique só, como no editor de fluxo que a equipe conhece.
   */
  const inserirNoCampo = (caminho: string) => {
    if (readOnly || foco === null) return;
    const atual = data.config[foco];
    mudarConfig({
      ...data.config,
      [foco]: `${typeof atual === 'string' ? atual : ''}{{${caminho}}}`,
    });
  };

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
      {!selected && resumo(data) !== '' && <span className="auto-node-sub">{resumo(data)}</span>}

      {selected && (
        <div className="auto-node-open">
          {/*
           * AU-27 — o que entra, à esquerda; o que sai, à direita; a configuração no meio.
           *
           * É a pergunta que trava quem desenha um fluxo — "o bloco de cima me entrega o quê?"
           * — respondida no lugar em que ela aparece, em vez de exigir abrir o log de uma
           * execução passada e conferir de cabeça.
           */}
          <PainelDeEntrada nodeId={id} campos={campos} onInserir={inserirNoCampo} />

          <div className="auto-node-meio">
            <BlockFields
              type={data.type}
              config={data.config}
              campos={campos}
              readOnly={readOnly}
              foco={foco}
              onFoco={setFoco}
              onChange={mudarConfig}
            />
            {/*
             * AU-26 — desligar sem tirar do quadro. Só aparece em quem tem uma saída só: "pule o
             * Se" não tem resposta, porque não diz por qual lado o fluxo sai.
             */}
            {PODEM_DESLIGAR.has(kind) && (
              <label className="switch-row nodrag">
                <span className="switch-label">
                  <span className="rowpanel-title">Bloco ligado</span>
                </span>
                <input
                  type="checkbox"
                  className="switch"
                  checked={data.config['disabled'] !== true}
                  disabled={readOnly}
                  onChange={(e) => mudarConfig({ ...data.config, disabled: !e.target.checked })}
                />
              </label>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-danger nodrag auto-node-remove"
              disabled={readOnly}
              onClick={remover}
            >
              Remover bloco
            </button>
          </div>

          <PainelDeSaida nodeId={id} />
        </div>
      )}

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
 * AU-27 — o que chega neste bloco.
 *
 * Com um ensaio rodado, são os valores de verdade: `contato.nome` e "Ana" ao lado. Sem ensaio,
 * são os campos que **existem** — o catálogo do gatilho mais as variáveis que o desenho define.
 * A lista serve às duas coisas ao mesmo tempo: saber o que há, e pôr no texto com um clique.
 */
function PainelDeEntrada({
  nodeId,
  campos,
  onInserir,
}: {
  nodeId: string;
  campos: readonly ContextField[];
  onInserir: (caminho: string) => void;
}): React.JSX.Element {
  const { ensaio } = useContext(QuadroContext);
  const passo = ensaio?.get(nodeId) ?? null;
  const linhas =
    passo === null
      ? campos.map((campo) => ({ path: campo.path, valor: campo.label }))
      : caminhosDe(passo.input);

  return (
    <div className="auto-io nodrag nowheel">
      <span className="field-label">Entra</span>
      {ensaio !== null && passo === null && (
        <span className="field-help">O ensaio não chegou aqui: este ramo não foi tomado.</span>
      )}
      {linhas.length === 0 ? (
        <span className="field-help">
          {passo === null
            ? 'Ponha o bloco de gatilho no quadro para ver o que ele traz.'
            : 'Nada chega aqui.'}
        </span>
      ) : (
        <ul className="auto-io-lista">
          {linhas.map((linha) => (
            <li key={linha.path}>
              {/* Clicar insere `{{caminho}}` no último campo que teve o foco. */}
              <button
                type="button"
                className="auto-io-item"
                title={`Pôr {{${linha.path}}} no campo`}
                onClick={() => onInserir(linha.path)}
              >
                <span className="auto-field-path">{linha.path}</span>
                <span className="cell-sub">{linha.valor === '' ? '—' : linha.valor}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * AU-27 — o que este bloco entrega ao próximo.
 *
 * Numa ação é o que ela **receberia**: nada é executado no ensaio, e mostrar "mensagem
 * enviada" seria prometer o que não aconteceu. Ainda assim é o que resolve o erro mais comum —
 * ver o `{{contato.nome}}` sair vazio aqui, e não no WhatsApp de alguém.
 */
function PainelDeSaida({ nodeId }: { nodeId: string }): React.JSX.Element {
  const { ensaio } = useContext(QuadroContext);
  const passo = ensaio?.get(nodeId) ?? null;
  const linhas = passo === null ? [] : caminhosDe(passo.output);

  return (
    <div className="auto-io nodrag nowheel">
      <span className="field-label">Sai</span>
      {passo === null ? (
        <span className="field-help">Ensaie para ver o que sairia daqui.</span>
      ) : (
        <>
          <span className="pill pill-neutral">{passo.outcome}</span>
          {linhas.length === 0 ? (
            <span className="field-help">Este bloco não acrescenta nada ao contexto.</span>
          ) : (
            <ul className="auto-io-lista">
              {linhas.map((linha) => (
                <li key={linha.path}>
                  <span className="auto-io-item is-leitura">
                    <span className="auto-field-path">{linha.path}</span>
                    <span className="cell-sub">{linha.valor === '' ? '—' : linha.valor}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
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
