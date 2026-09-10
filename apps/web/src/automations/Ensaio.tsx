import { useState } from 'react';
import { api } from '../auth/api.js';
import { blockLabel } from './blocks.js';
import { camposDoGatilho, gatilhoDoQuadro, variaveisDeCampos } from './fields.js';
import { fonteDoGatilho } from './fonteDoContexto.js';
import { useRecentBookings } from '../queue/useRecentBookings.js';
import type { AutomationGraph } from '@expedition/domain';
import type { PassoEnsaiado } from './simulacao.js';

/**
 * AU-25 — ensaiar antes de ligar.
 *
 * A pergunta que ninguém conseguia responder sem ligar a automação era simples: "com um
 * contato chamado Ana perguntando o preço, por onde este fluxo passa?". Aqui ela se responde
 * preenchendo os campos que o gatilho traria e lendo o caminho de volta.
 *
 * **Nada acontece.** Ação nenhuma é executada, mensagem nenhuma sai, e o ensaio não entra no
 * log da automação. O que aparece é o que *aconteceria* — inclusive o texto de cada mensagem
 * já com os marcadores trocados, que é onde se vê o `{{contato.nome}}` que ia sair vazio.
 */

type Estado =
  | { status: 'form' }
  | { status: 'loading' }
  | { status: 'ready'; passos: PassoEnsaiado[] }
  | { status: 'error'; message: string };

export function Ensaio({
  automationId,
  graph,
  onResultado,
  untilNodeId,
  onClose,
}: {
  automationId: string;
  graph: AutomationGraph;
  /**
   * AU-27 — o resultado sobe para o editor, que o entrega a cada bloco do quadro. O desenho
   * ensaiado vai junto: é ele que diz até quando o resultado ainda responde pelo quadro.
   */
  onResultado: (passos: PassoEnsaiado[], graph: AutomationGraph) => void;
  /** AU-25 — quando vem, o ensaio para depois deste bloco: o resto não foi pedido. */
  untilNodeId?: string | undefined;
  onClose: () => void;
}): React.JSX.Element {
  const gatilho = gatilhoDoQuadro(
    graph.nodes.map((no) => ({ type: no.kind, data: { type: no.type, config: no.config } })),
  );
  const fonte = fonteDoGatilho(gatilho);
  // Com uma inscrição de verdade escolhida, não há campo nenhum para preencher.
  const campos = gatilho === null || fonte !== 'manual' ? [] : camposDoGatilho(gatilho);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [inscricao, setInscricao] = useState<string>('');
  const [estado, setEstado] = useState<Estado>({ status: 'form' });

  /** O que vai no corpo: a fonte, quando há uma; o que foi digitado, quando não há. */
  const amostra = (): Record<string, unknown> => {
    if (fonte === 'agora') return { source: { kind: 'agora' } };
    if (fonte === 'inscricao' && inscricao !== '') {
      return { source: { kind: 'inscricao', bookingId: inscricao } };
    }
    return { variables: variaveisDeCampos(valores) };
  };

  const ensaiar = async (): Promise<void> => {
    setEstado({ status: 'loading' });
    try {
      const res = await api(`/v1/automations/${encodeURIComponent(automationId)}/simulate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // AU-27: vai o desenho da tela junto — ensaiar o que está salvo, depois de mexer
        // num bloco, faria a pessoa concluir a coisa errada sobre a própria mudança.
        body: JSON.stringify({
          ...amostra(),
          graph,
          ...(untilNodeId === undefined ? {} : { untilNodeId }),
        }),
      });
      if (!res.ok) {
        setEstado({
          status: 'error',
          message:
            res.status === 401 || res.status === 403
              ? // O servidor pede `requireTeam`, que inclui o viewer: ensaiar não manda nada e
                // não grava nada. A tela dizia "owner ou admin", que é outra regra.
                'Ensaiar é de quem faz parte da equipe.'
              : 'Não deu para ensaiar. Tente de novo.',
        });
        return;
      }
      const passos = (await res.json()) as PassoEnsaiado[];
      setEstado({ status: 'ready', passos });
      // AU-27: o quadro inteiro passa a mostrar entrada e saída por bloco a partir daqui.
      onResultado(passos, graph);
    } catch {
      setEstado({ status: 'error', message: 'Falha de conexão.' });
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Ensaiar automação">
      <div className="modal modal-lg">
        <h2 className="modal-title">Ensaiar</h2>
        <p className="cell-sub">
          Percorre o desenho com estes dados e mostra por onde ele passaria. Nada é enviado e nada
          fica no log.
        </p>

        {gatilho === null && (
          <div className="feedback feedback-info">
            <span className="feedback-dot" />
            <span>Ponha o bloco de gatilho no quadro para saber quais campos preencher.</span>
          </div>
        )}

        {/*
         * AU-25 — com uma inscrição de verdade, não há campo para preencher: o contexto sai da
         * mesma função que a borda usa no gatilho, então o ensaio responde pelo que a execução
         * real teria — e não por dezoito valores inventados na hora.
         */}
        {fonte === 'inscricao' && <EscolherInscricao valor={inscricao} onEscolher={setInscricao} />}

        {fonte === 'agora' && (
          <p className="field-help">
            Este gatilho não pende de entidade nenhuma: o ensaio usa a data e a hora de agora.
          </p>
        )}

        <div className="form-grid">
          {campos.map((campo) => (
            <label key={campo.path} className="field">
              <span className="field-label">{campo.label}</span>
              <input
                className="field-input"
                value={valores[campo.path] ?? ''}
                placeholder={campo.path}
                onChange={(e) => setValores((v) => ({ ...v, [campo.path]: e.target.value }))}
              />
            </label>
          ))}
        </div>

        {estado.status === 'error' && (
          <div className="feedback feedback-error" role="alert">
            <span className="feedback-dot" />
            <span>{estado.message}</span>
          </div>
        )}

        {/* Esqueleto na forma da trilha que vai aparecer, e não um "aguarde" solto. */}
        {estado.status === 'loading' && (
          <div className="skeleton" aria-label="Ensaiando" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skel-card">
                <span className="skel-bars">
                  <span className="skel-bar" />
                  <span className="skel-bar short" />
                </span>
              </div>
            ))}
          </div>
        )}

        {estado.status === 'ready' && estado.passos.length === 0 && (
          <p className="members-empty">
            O fluxo não andou: o gatilho não leva a bloco nenhum, ou o quadro está vazio.
          </p>
        )}

        {estado.status === 'ready' && estado.passos.length > 0 && (
          <span className="field-help">
            Os blocos do quadro agora mostram o que entra e o que sai de cada um.
          </span>
        )}

        {estado.status === 'ready' && estado.passos.length > 0 && (
          <ol className="auto-ensaio">
            {estado.passos.map((passo, i) => (
              <li key={`${passo.nodeId}-${String(i)}`}>
                <span className="auto-ensaio-n mono">{i + 1}</span>
                <span className="auto-ensaio-corpo">
                  <span className="cell-name">{blockLabel(passo.type)}</span>
                  <span className="cell-sub">{descrever(passo)}</span>
                </span>
                <span className="pill pill-neutral">{passo.outcome}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={estado.status === 'loading'}
            onClick={() => void ensaiar()}
          >
            Ensaiar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * O detalhe do passo em uma linha. É JSON no servidor porque cada bloco guarda coisa
 * diferente; aqui vira `chave: valor` legível, que é o que se lê de relance.
 */
function descrever(passo: PassoEnsaiado): string {
  const partes = Object.entries(passo.detail)
    .filter(([chave]) => chave !== 'disabled' && chave !== 'saveAs')
    .map(([chave, valor]) => `${chave}: ${texto(valor)}`);
  return partes.length === 0 ? '—' : partes.join(' · ');
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

/**
 * AU-25 — a inscrição que vai alimentar o ensaio.
 *
 * A lista é a mesma que a fila de alocação já usa (IN-17b): as últimas que entraram, com
 * responsável e saída no rótulo. Escolher pelo nome de quem se inscreveu é o que torna o gesto
 * possível — uma lista de ids não seria escolha, seria sorteio.
 */
function EscolherInscricao({
  valor,
  onEscolher,
}: {
  valor: string;
  onEscolher: (bookingId: string) => void;
}): React.JSX.Element {
  const { state } = useRecentBookings();

  if (state.status === 'loading') {
    return <p className="field-help">Carregando as últimas inscrições…</p>;
  }
  if (state.status === 'error') {
    return <p className="field-help">Não deu para carregar as inscrições. Digite os campos.</p>;
  }
  if (state.rows.length === 0) {
    return (
      <p className="field-help">
        Nenhuma inscrição ainda. Quando houver uma, dá para ensaiar com os dados dela.
      </p>
    );
  }

  return (
    <label className="field field-full">
      <span className="field-label">Ensaiar com esta inscrição</span>
      <select className="field-input" value={valor} onChange={(e) => onEscolher(e.target.value)}>
        <option value="">Escolha uma inscrição</option>
        {state.rows.map((linha) => (
          <option key={linha.bookingId} value={linha.bookingId}>
            {linha.responsibleName} · {linha.groupName}
          </option>
        ))}
      </select>
      <span className="field-help">
        Os campos do gatilho saem dela, do mesmo jeito que sairiam numa execução de verdade.
      </span>
    </label>
  );
}
