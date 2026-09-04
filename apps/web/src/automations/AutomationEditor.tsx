import { useCallback, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  Background,
  ConnectionLineType,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ACOES_DE_DINHEIRO, BLOCOS, GATILHOS, blockLabel, type BlockType } from './blocks.js';
import { RunLog } from './RunLog.js';
import { Ensaio } from './Ensaio.js';
import { porBloco, type PassoEnsaiado } from './simulacao.js';
import { NODE_TYPES, QuadroContext, type BlockNodeType } from './BlockNode.js';
import { fromFlow, toFlow } from './flowMapping.js';
import type { Automation } from './useAutomations.js';
import type { AutomationGraph } from '@expedition/domain';

/**
 * AU-01 · AU-07 — o editor de fluxo.
 *
 * **O quadro é a tela inteira.** Tinha uma coluna de biblioteca à esquerda e uma de inspetor à
 * direita, e as duas cobravam do desenho o espaço que ele mais precisa: um fluxo de dez blocos
 * não cabe em setecentos pixels. A biblioteca virou barra flutuante sobre o quadro, e a
 * configuração foi para dentro do próprio bloco.
 *
 * O quadro é infinito, com zoom e arrasto; a posição de cada bloco viaja no grafo, então o
 * desenho que a pessoa deixou é o desenho que ela encontra depois.
 *
 * **Automação ligada não se edita.** O servidor recusa (é lá que a regra mora e está testada),
 * e aqui o quadro fica só de leitura em vez de deixar mexer e falhar no salvar — a pessoa
 * descobre a regra antes de perder o trabalho, não depois.
 */

/** Linha reta em ângulo, sem curva e sem seta: o que importa é de onde para onde. */
const LIGACAO: DefaultEdgeOptions = { type: 'step' };

/** As espécies de um tipo só viram botão direto; gatilho e ação têm muitos, e viram menu. */
const ACOES = BLOCOS.filter((bloco) => bloco.kind === 'action');
const SOLTOS = BLOCOS.filter((bloco) => bloco.kind !== 'action');

export function AutomationEditor(props: {
  automation: Automation;
  busy: boolean;
  onBack: () => void;
  onSave: (graph: AutomationGraph) => Promise<{ ok: boolean; message?: string }>;
  onToggle: (
    enabled: boolean,
    confirmMoneyActions?: boolean,
  ) => Promise<{ ok: boolean; message?: string }>;
}): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function Editor({
  automation,
  busy,
  onBack,
  onSave,
  onToggle,
}: {
  automation: Automation;
  busy: boolean;
  onBack: () => void;
  onSave: (graph: AutomationGraph) => Promise<{ ok: boolean; message?: string }>;
  onToggle: (
    enabled: boolean,
    confirmMoneyActions?: boolean,
  ) => Promise<{ ok: boolean; message?: string }>;
}): React.JSX.Element {
  const inicial = useMemo(() => {
    const { nodes: blocos, edges: ligacoes } = toFlow(automation.graph);
    return { nodes: blocos as BlockNodeType[], edges: ligacoes as Edge[] };
  }, [automation.graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<BlockNodeType>(inicial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(inicial.edges);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sujo, setSujo] = useState(false);
  const [verLog, setVerLog] = useState(false);
  const [ensaiando, setEnsaiando] = useState(false);
  /*
   * AU-27 — o último ensaio fica com o editor, e não com o painel que o pediu: quem o consome
   * é cada bloco do quadro, e o painel é só onde se digita o contexto do gatilho.
   */
  const [ensaio, setEnsaio] = useState<Map<string, PassoEnsaiado> | null>(null);
  const [menu, setMenu] = useState<'trigger' | 'action' | null>(null);
  const [confirmarDinheiro, setConfirmarDinheiro] = useState(false);
  const quadro = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const readOnly = automation.enabled || busy;

  /** Põe o bloco numa posição do **quadro** — a que o grafo guarda. */
  const acrescentarEm = useCallback(
    (bloco: BlockType, posicao: { x: number; y: number }) => {
      const novo: BlockNodeType = {
        id: crypto.randomUUID(),
        type: bloco.kind,
        position: posicao,
        data: { type: bloco.type, config: { ...bloco.config } },
        // O bloco novo nasce aberto: quem acabou de pôr um bloco no quadro vai configurá-lo.
        selected: true,
      };
      setNodes((atuais) => [...atuais.map((n) => ({ ...n, selected: false })), novo]);
      setMenu(null);
      setSujo(true);
    },
    [setNodes],
  );

  /** O mesmo, a partir de uma posição da **tela** — é o que o arrastar-e-soltar tem. */
  const acrescentar = useCallback(
    (bloco: BlockType, tela: { x: number; y: number }) =>
      acrescentarEm(bloco, screenToFlowPosition(tela)),
    [acrescentarEm, screenToFlowPosition],
  );

  /**
   * Pelo botão da barra, o bloco entra **abaixo do último**, na coluna dele. Cair no meio da
   * tela punha um bloco em cima do outro, e a primeira tarefa de quem acrescentou passava a
   * ser desempilhar o que acabou de pôr.
   */
  const acrescentarAbaixo = useCallback(
    (bloco: BlockType) => {
      const ultimo = [...nodes].sort((a, b) => a.position.y - b.position.y).pop();
      if (ultimo) {
        acrescentarEm(bloco, {
          x: ultimo.position.x,
          y: ultimo.position.y + (ultimo.measured?.height ?? 90) + 70,
        });
        return;
      }
      const r = quadro.current?.getBoundingClientRect();
      if (r) acrescentar(bloco, { x: r.left + r.width / 2, y: r.top + r.height / 3 });
    },
    [acrescentar, acrescentarEm, nodes],
  );

  const conectar = useCallback(
    (ligacao: Connection) => {
      setEdges((atuais) => {
        // Uma porta, um caminho: a ligação nova substitui a que já saía dali, em vez de
        // empilhar duas e deixar a ordem de execução no acaso.
        const limpas = atuais.filter(
          (e) => !(e.source === ligacao.source && e.sourceHandle === ligacao.sourceHandle),
        );
        return addEdge({ ...ligacao, id: crypto.randomUUID() }, limpas);
      });
      setSujo(true);
    },
    [setEdges],
  );

  const salvar = useCallback(async () => {
    setAviso(null);
    const r = await onSave(fromFlow(nodes, edges));
    if (r.ok) setSujo(false);
    else setAviso(r.message ?? 'Não foi possível salvar.');
  }, [edges, nodes, onSave]);

  // AU-14: um gatilho por quadro. A barra fecha o menu dos outros em vez de deixar pôr dois e
  // recusar no salvar — o erro aparece antes de a pessoa desenhar o resto em cima dele.
  const temGatilho = nodes.some((n) => n.type === 'trigger');

  return (
    <main className="page page-wide page-chat">
      <div className="page-header">
        <div className="toolbar">
          <div>
            <button type="button" className="crumb-link" onClick={onBack}>
              ← Automações
            </button>
            <h1 className="page-title">{automation.name}</h1>
            <p className="page-meta">
              {automation.enabled
                ? 'Ligada: está agindo sobre clientes agora. Desligue para editar o fluxo.'
                : 'Ponha os blocos pela barra do quadro e ligue a saída de um na entrada do próximo.'}
            </p>
          </div>
          <div className="link-actions">
            <label className="switch-row">
              <span className="switch-label">
                <span className="rowpanel-title">Ligada</span>
              </span>
              <input
                type="checkbox"
                className="switch"
                aria-label={`Ligar ${automation.name}`}
                checked={automation.enabled}
                disabled={busy}
                onChange={async (e) => {
                  setAviso(null);
                  // AU-13: ligar um fluxo que mexe no financeiro passa por um aviso à parte,
                  // dizendo em texto o que ela vai fazer sozinha.
                  if (e.target.checked && dinheiroNoFluxo(nodes).length > 0) {
                    setConfirmarDinheiro(true);
                    return;
                  }
                  const r = await onToggle(e.target.checked);
                  if (!r.ok) setAviso(r.message ?? 'Não foi possível mudar.');
                }}
              />
            </label>
            {/* AU-25: ensaiar fica ao lado de salvar porque é o gesto de antes de ligar. */}
            <button type="button" className="btn btn-secondary" onClick={() => setEnsaiando(true)}>
              Ensaiar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setVerLog((v) => !v)}
            >
              {verLog ? 'Ver o quadro' : 'Ver execuções'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={readOnly || !sujo}
              onClick={() => void salvar()}
            >
              {busy ? 'Salvando…' : 'Salvar fluxo'}
            </button>
          </div>
        </div>
      </div>

      {aviso && (
        <div className="feedback feedback-error" role="alert">
          <span className="feedback-dot" />
          <span>{aviso}</span>
        </div>
      )}

      {verLog ? (
        <RunLog automationId={automation.id} />
      ) : (
        <QuadroContext value={{ readOnly, ensaio }}>
          <div
            className="auto-canvas"
            ref={quadro}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const tipo = e.dataTransfer.getData('text/plain');
              const bloco = [...BLOCOS, ...GATILHOS].find((b) => b.type === tipo);
              if (bloco) acrescentar(bloco, { x: e.clientX, y: e.clientY });
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              /*
               * Linha reta em ângulo, sem curva: num fluxograma a curva não diz nada e ainda
               * disputa a leitura com o próprio bloco. O segmento reto mostra de onde para
               * onde, e só.
               */
              defaultEdgeOptions={LIGACAO}
              connectionLineType={ConnectionLineType.Step}
              onNodesChange={(mudancas) => {
                onNodesChange(mudancas);
                if (mudancas.some((m) => m.type !== 'select' && m.type !== 'dimensions')) {
                  setSujo(true);
                }
              }}
              onEdgesChange={(mudancas) => {
                onEdgesChange(mudancas);
                if (mudancas.some((m) => m.type !== 'select')) setSujo(true);
              }}
              onConnect={conectar}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              elementsSelectable
              deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
              fitView
              /* Um bloco só não pode nascer ampliado ao dobro: o quadro abre em escala real. */
              fitViewOptions={{ maxZoom: 1, padding: 0.25 }}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: false }}
            >
              <Background gap={22} size={1.4} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable />

              {/*
               * A biblioteca virou barra flutuante **sobre** o quadro: a coluna que ela ocupava
               * era espaço que o desenho queria, e um fluxo de dez blocos não cabe em setecentos
               * pixels. Aqui ela custa a altura de um botão.
               */}
              <Panel position="top-left" className="auto-bar">
                <MenuDeBlocos
                  rotulo="Gatilho"
                  blocos={GATILHOS}
                  // AU-14: com um gatilho no quadro, o menu fecha. Trocar de gatilho é remover
                  // o que está lá e pôr outro — decisão, não acidente.
                  disabled={readOnly || temGatilho}
                  titulo={temGatilho ? 'Já existe um gatilho no quadro' : undefined}
                  aberto={menu === 'trigger'}
                  onAbrir={() => setMenu(menu === 'trigger' ? null : 'trigger')}
                  onEscolher={acrescentarAbaixo}
                />
                {SOLTOS.map((bloco) => (
                  <button
                    key={bloco.type}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={readOnly}
                    title={bloco.hint}
                    onClick={() => acrescentarAbaixo(bloco)}
                  >
                    {bloco.label}
                  </button>
                ))}
                <MenuDeBlocos
                  rotulo="Ação"
                  blocos={ACOES}
                  disabled={readOnly}
                  aberto={menu === 'action'}
                  onAbrir={() => setMenu(menu === 'action' ? null : 'action')}
                  onEscolher={acrescentarAbaixo}
                />
              </Panel>

              {nodes.length === 0 && (
                <Panel position="top-center" className="auto-hint">
                  <span className="cell-sub">
                    Comece pelo gatilho: é ele que decide quando a automação roda e quais campos o
                    fluxo vai ter.
                  </span>
                </Panel>
              )}
            </ReactFlow>
          </div>
        </QuadroContext>
      )}

      {ensaiando && (
        <Ensaio
          automationId={automation.id}
          graph={fromFlow(nodes, edges)}
          onResultado={(passos) => setEnsaio(porBloco(passos))}
          onClose={() => setEnsaiando(false)}
        />
      )}

      {confirmarDinheiro && (
        <ConfirmarDinheiro
          acoes={dinheiroNoFluxo(nodes)}
          busy={busy}
          onClose={() => setConfirmarDinheiro(false)}
          onConfirmar={async () => {
            const r = await onToggle(true, true);
            setConfirmarDinheiro(false);
            if (!r.ok) setAviso(r.message ?? 'Não foi possível ligar.');
          }}
        />
      )}
    </main>
  );
}

/**
 * Um grupo de blocos que não cabe em botão único: os oito gatilhos e as cinco ações. O resto
 * das espécies tem um tipo só, e vira botão direto — menu de um item é clique a mais por nada.
 */
function MenuDeBlocos({
  rotulo,
  blocos,
  disabled,
  titulo,
  aberto,
  onAbrir,
  onEscolher,
}: {
  rotulo: string;
  blocos: readonly BlockType[];
  disabled: boolean;
  titulo?: string | undefined;
  aberto: boolean;
  onAbrir: () => void;
  onEscolher: (bloco: BlockType) => void;
}): React.JSX.Element {
  return (
    <div className="auto-menu-wrap">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={disabled}
        title={titulo}
        aria-expanded={aberto}
        onClick={onAbrir}
      >
        {rotulo} ▾
      </button>

      {aberto && (
        <div className="menu auto-menu" role="menu">
          {blocos.map((bloco) => (
            <button
              key={bloco.type}
              type="button"
              className="menu-item"
              role="menuitem"
              onClick={() => onEscolher(bloco)}
            >
              <span className="cell-name">{bloco.label}</span>
              <span className="cell-sub">{bloco.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Quais ações do desenho mexem no financeiro. Vazio é o caso comum. */
function dinheiroNoFluxo(nodes: readonly BlockNodeType[]): string[] {
  return [
    ...new Set(
      nodes.filter((n) => ACOES_DE_DINHEIRO.has(n.data.type)).map((n) => blockLabel(n.data.type)),
    ),
  ];
}

/**
 * AU-13 — o aviso antes de ligar um fluxo que mexe em dinheiro.
 *
 * Não é confirmação genérica de "tem certeza?": ela **nomeia** o que a automação vai fazer
 * sozinha. Uma pessoa confirmando inscrição na tela vê a inscrição; aqui ela precisa ver, em
 * texto, o que vai acontecer trinta vezes sem ninguém olhando.
 */
function ConfirmarDinheiro({
  acoes,
  busy,
  onClose,
  onConfirmar,
}: {
  acoes: string[];
  busy: boolean;
  onClose: () => void;
  onConfirmar: () => void;
}): React.JSX.Element {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Ligar automação">
      <div className="modal">
        <h2 className="modal-title">Esta automação mexe no financeiro</h2>
        <p className="modal-sub">Ligada, ela vai fazer isto sozinha, sem ninguém olhando:</p>
        <ul className="auto-money-list">
          {acoes.map((acao) => (
            <li key={acao} className="cell-name">
              {acao}
            </li>
          ))}
        </ul>
        <p className="field-help">
          Cada uma vai para o histórico da inscrição marcada como automação. Você pode desligar a
          qualquer momento.
        </p>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Voltar
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirmar}>
            Ligar mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}
