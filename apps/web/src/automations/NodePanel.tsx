import { useRef, useState } from 'react';
import { useNodes, useReactFlow } from '@xyflow/react';
import { blockLabel, saidasDe } from './blocks.js';
import { caminhosDe, camposDisponiveis } from './fields.js';
import { BlockFields, type CampoDeTexto } from './BlockFields.js';
import { inserirMarcador } from './marcador.js';
import type { ContextField, NodeKind } from '@expedition/domain';
import type { BlockNodeType } from './BlockNode.js';
import type { PassoEnsaiado } from './simulacao.js';

/**
 * AU-27 — o bloco aberto: o que entra, o que ele faz, o que sai.
 *
 * **Vive fora do quadro, e a razão é de leitura.** Enquanto morava dentro do nó, o painel era
 * desenhado pelo mesmo transform que dá zoom ao canvas: a 0,4 de escala o texto ficava em 40% e
 * ninguém lia o valor de nada. Aqui em cima ele é sempre do tamanho que é.
 *
 * O que vem junto de graça, por não estar mais dentro do `<ReactFlow>`: `Delete` num campo de
 * texto deixa de apagar o bloco, e `nodrag`/`nowheel` deixam de ser necessários em cada
 * controle — o quadro não vê estes eventos.
 *
 * **A verdade continua sendo o quadro.** O painel lê os nós e escreve com `updateNodeData`,
 * como o bloco fazia; ele é projeção, não cópia.
 */

/** AU-26 — quem tem uma saída só pode ser pulado; quem separa caminho, não. */
const PODEM_DESLIGAR = new Set<NodeKind>(['action', 'delay', 'setVariable', 'forEach']);

export function NodePanel({
  nodeId,
  readOnly,
  ensaio,
  podeEnsaiar,
  onEnsaiar,
  onFechar,
}: {
  nodeId: string;
  readOnly: boolean;
  ensaio: Map<string, PassoEnsaiado> | null;
  podeEnsaiar: boolean;
  onEnsaiar: () => void;
  onFechar: () => void;
}): React.JSX.Element | null {
  const nodes = useNodes<BlockNodeType>();
  const { updateNodeData, setNodes, setEdges } = useReactFlow<BlockNodeType>();
  /*
   * AU-27 — qual campo recebe a variável clicada, e **onde dentro dele**. Mora aqui porque é
   * deste painel o formulário. O elemento vem junto da chave: é dele que sai a posição do
   * cursor, e clicar na lista já tirou o foco do campo quando a hora de inserir chega.
   */
  const [foco, setFoco] = useState<string | null>(null);
  const campoEmFoco = useRef<CampoDeTexto | null>(null);

  const no = nodes.find((candidato) => candidato.id === nodeId);
  // O bloco pode ter sido removido com o painel aberto: fechar é a resposta, não quebrar.
  if (no === undefined) return null;

  const kind = (no.type ?? 'action') as NodeKind;
  const campos = camposDisponiveis(nodes);
  const passo = ensaio?.get(nodeId) ?? null;

  const mudarConfig = (config: Record<string, unknown>) => {
    updateNodeData(nodeId, { config });
    /*
     * AU-15 — apagar um valor da escolha múltipla apaga a saída dele, e a ligação que saía
     * dali deixa de ter porta. Limpar aqui é o que evita salvar um desenho com ligação
     * pendurada numa saída que não existe mais: recusado no servidor, e sem nada no quadro
     * explicando por quê.
     */
    const portas = new Set(saidasDe(kind, config).map((saida) => saida.port));
    setEdges((atuais) =>
      atuais.filter((e) => e.source !== nodeId || portas.has(e.sourceHandle ?? 'next')),
    );
  };

  const remover = () => {
    setNodes((atuais) => atuais.filter((n) => n.id !== nodeId));
    setEdges((atuais) => atuais.filter((e) => e.source !== nodeId && e.target !== nodeId));
    onFechar();
  };

  /**
   * AU-27 — a variável entra no texto por clique, e não por digitação.
   *
   * O campo que recebe é o **último que teve o foco** — marcado com o anel do accent, senão
   * clicar na lista seria um tiro no escuro: o texto apareceria em algum lugar, e não se sabe
   * qual. E entra **onde o cursor estava**: no fim de tudo, escrever a mensagem e depois pôr o
   * nome do cliente no começo dela seria impossível.
   */
  const inserirNoCampo = (caminho: string) => {
    if (readOnly || foco === null) return;
    const atual = no.data.config[foco];
    const alvo = campoEmFoco.current;
    const { texto, cursor } = inserirMarcador(
      typeof atual === 'string' ? atual : '',
      alvo?.selectionStart ?? null,
      alvo?.selectionEnd ?? null,
      caminho,
    );
    mudarConfig({ ...no.data.config, [foco]: texto });
    // O foco volta para onde a pessoa estava escrevendo, logo depois do que acabou de entrar.
    queueMicrotask(() => {
      alvo?.focus();
      alvo?.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Bloco ${blockLabel(no.data.type)}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onFechar();
      }}
    >
      <div className="modal modal-full">
        <div className="toolbar auto-panel-head">
          <div className="state-text">
            <h2 className="modal-title">{blockLabel(no.data.type)}</h2>
            <span className="modal-sub">{ESPECIE[kind]}</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onFechar}>
            Fechar
          </button>
        </div>

        <div className="auto-panel">
          <PainelDeEntrada campos={campos} passo={passo} onInserir={inserirNoCampo} />

          <div className="auto-panel-meio">
            <BlockFields
              type={no.data.type}
              config={no.data.config}
              campos={campos}
              readOnly={readOnly}
              foco={foco}
              onFoco={(key, campo) => {
                setFoco(key);
                campoEmFoco.current = campo;
              }}
              onChange={mudarConfig}
            />
            {/*
             * AU-26 — desligar sem tirar do quadro. Só aparece em quem tem uma saída só: "pule o
             * Se" não tem resposta, porque não diz por qual lado o fluxo sai.
             */}
            {PODEM_DESLIGAR.has(kind) && (
              <label className="switch-row">
                <span className="switch-label">
                  <span className="rowpanel-title">Bloco ligado</span>
                </span>
                <input
                  type="checkbox"
                  className="switch"
                  checked={no.data.config['disabled'] !== true}
                  disabled={readOnly}
                  onChange={(e) => mudarConfig({ ...no.data.config, disabled: !e.target.checked })}
                />
              </label>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-danger auto-panel-remove"
              disabled={readOnly}
              onClick={remover}
            >
              Remover bloco
            </button>
          </div>

          <PainelDeSaida passo={passo} podeEnsaiar={podeEnsaiar} onEnsaiar={onEnsaiar} />
        </div>
      </div>
    </div>
  );
}

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

/**
 * AU-27 — o que chega neste bloco.
 *
 * Com um ensaio rodado, são os valores de verdade: `contato.nome` e "Ana" ao lado. Sem ensaio,
 * são os campos que **existem** — o catálogo do gatilho mais as variáveis que o desenho define.
 * A lista serve às duas coisas ao mesmo tempo: saber o que há, e pôr no texto com um clique.
 */
function PainelDeEntrada({
  campos,
  passo,
  onInserir,
}: {
  campos: readonly ContextField[];
  passo: PassoEnsaiado | null;
  onInserir: (caminho: string) => void;
}): React.JSX.Element {
  const linhas =
    passo === null
      ? campos.map((campo) => ({ path: campo.path, valor: campo.label }))
      : caminhosDe(passo.input);

  return (
    <div className="auto-io">
      <span className="field-label">Entra</span>
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
                <span className="auto-io-valor">{linha.valor === '' ? '—' : linha.valor}</span>
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
function PainelDeSaida({
  passo,
  podeEnsaiar,
  onEnsaiar,
}: {
  passo: PassoEnsaiado | null;
  podeEnsaiar: boolean;
  onEnsaiar: () => void;
}): React.JSX.Element {
  const linhas = passo === null ? [] : caminhosDe(passo.output);

  return (
    <div className="auto-io">
      <span className="field-label">Sai</span>
      {passo === null ? (
        /*
         * Vazio é **convite com a ação ao lado**, não um aviso sem saída. Enquanto foi só a
         * frase "ensaie para ver", esta coluna pedia uma coisa e não dizia onde fazê-la — e a
         * do lado, com os campos listados, parecia estar funcionando melhor.
         */
        <div className="state-text auto-io-convite">
          <span className="state-title">Ainda não ensaiou</span>
          <span className="state-line">Percorra o desenho para ver o que sairia daqui.</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!podeEnsaiar}
            title={podeEnsaiar ? undefined : 'Ensaiar é de quem faz parte da equipe.'}
            onClick={onEnsaiar}
          >
            Ensaiar
          </button>
        </div>
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
                    <span className="auto-io-valor">{linha.valor === '' ? '—' : linha.valor}</span>
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
