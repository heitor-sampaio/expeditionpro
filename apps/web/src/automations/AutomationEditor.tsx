import { useCallback, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { BLOCOS, GATILHOS, type BlockType } from './blocks.js';
import { NODE_TYPES, type BlockNodeType } from './BlockNode.js';
import { BlockInspector } from './BlockInspector.js';
import { fromFlow, toFlow } from './flowMapping.js';
import type { Automation } from './useAutomations.js';
import type { AutomationGraph } from '@expedition/domain';

/**
 * AU-01 · AU-07 — o editor de fluxo.
 *
 * Três colunas, como a caixa de conversas: biblioteca de blocos · quadro · inspetor. O quadro
 * é infinito, com zoom e arrasto; a posição de cada bloco viaja no grafo, então o desenho que
 * a pessoa deixou é o desenho que ela encontra depois.
 *
 * **Automação ligada não se edita.** O servidor recusa (é lá que a regra mora e está testada),
 * e aqui o quadro fica só de leitura em vez de deixar mexer e falhar no salvar — a pessoa
 * descobre a regra antes de perder o trabalho, não depois.
 */
export function AutomationEditor(props: {
  automation: Automation;
  busy: boolean;
  onBack: () => void;
  onSave: (graph: AutomationGraph) => Promise<{ ok: boolean; message?: string }>;
  onToggle: (enabled: boolean) => Promise<{ ok: boolean; message?: string }>;
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
  onToggle: (enabled: boolean) => Promise<{ ok: boolean; message?: string }>;
}): React.JSX.Element {
  const inicial = useMemo(() => {
    const { nodes: blocos, edges: ligacoes } = toFlow(automation.graph);
    // O gatilho é a porta de entrada do fluxo: apagá-lo com a tecla deixaria a automação sem
    // começo, e o erro só apareceria no salvar. Mais barato não deixar apagar.
    return {
      nodes: blocos.map((n) => ({ ...n, deletable: n.type !== 'trigger' })) as BlockNodeType[],
      edges: ligacoes as Edge[],
    };
  }, [automation.graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<BlockNodeType>(inicial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(inicial.edges);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sujo, setSujo] = useState(false);
  const quadro = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const readOnly = automation.enabled || busy;

  const acrescentar = useCallback(
    (bloco: BlockType, tela: { x: number; y: number }) => {
      const novo: BlockNodeType = {
        id: crypto.randomUUID(),
        type: bloco.kind,
        position: screenToFlowPosition(tela),
        data: { type: bloco.type, config: { ...bloco.config } },
      };
      setNodes((atuais) => [...atuais, novo]);
      setSelecionado(novo.id);
      setSujo(true);
    },
    [screenToFlowPosition, setNodes],
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

  const noSelecionado = nodes.find((n) => n.id === selecionado) ?? null;

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
                : 'Arraste um bloco da biblioteca para o quadro e ligue as saídas.'}
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
                  const r = await onToggle(e.target.checked);
                  if (!r.ok) setAviso(r.message ?? 'Não foi possível mudar.');
                }}
              />
            </label>
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

      <div className="inbox auto-editor">
        <nav className="inbox-list auto-lib" aria-label="Biblioteca de blocos">
          <span className="inbox-side-title auto-lib-head">Blocos</span>
          {BLOCOS.map((bloco) => (
            <button
              key={bloco.type}
              type="button"
              className="auto-lib-item"
              draggable={!readOnly}
              disabled={readOnly}
              onDragStart={(e) => e.dataTransfer.setData('text/plain', bloco.type)}
              /*
               * Clicar acrescenta no meio do quadro. É o caminho que funciona no toque, onde
               * arrastar de uma coluna para outra não existe — e o app do Capacitor é toque.
               */
              onClick={() => {
                const r = quadro.current?.getBoundingClientRect();
                if (r) acrescentar(bloco, { x: r.left + r.width / 2, y: r.top + r.height / 3 });
              }}
            >
              <span className="cell-name">{bloco.label}</span>
              <span className="cell-sub">{bloco.hint}</span>
            </button>
          ))}
          <p className="field-help auto-lib-foot">
            Os blocos já se desenham e se salvam. Executar o fluxo vem na próxima etapa — até lá,
            uma automação ligada não dispara nada.
          </p>
        </nav>

        <div
          className="inbox-thread auto-canvas"
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
            onSelectionChange={({ nodes: escolhidos }) => setSelecionado(escolhidos[0]?.id ?? null)}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={22} size={1.4} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        <BlockInspector
          node={noSelecionado}
          readOnly={readOnly}
          onChange={(config) => {
            setNodes((atuais) =>
              atuais.map((n) => (n.id === selecionado ? { ...n, data: { ...n.data, config } } : n)),
            );
            setSujo(true);
          }}
          onDelete={() => {
            setNodes((atuais) => atuais.filter((n) => n.id !== selecionado));
            setEdges((atuais) =>
              atuais.filter((e) => e.source !== selecionado && e.target !== selecionado),
            );
            setSelecionado(null);
            setSujo(true);
          }}
        />
      </div>
    </main>
  );
}
