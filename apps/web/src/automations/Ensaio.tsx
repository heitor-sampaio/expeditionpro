import { useState } from 'react';
import { api } from '../auth/api.js';
import { blockLabel } from './blocks.js';
import { camposDoGatilho, gatilhoDoQuadro, variaveisDeCampos } from './fields.js';
import type { AutomationGraph } from '@expedition/domain';

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

interface PassoEnsaiado {
  nodeId: string;
  kind: string;
  type: string;
  outcome: string;
  detail: Record<string, unknown>;
}

type Estado =
  | { status: 'form' }
  | { status: 'loading' }
  | { status: 'ready'; passos: PassoEnsaiado[] }
  | { status: 'error'; message: string };

export function Ensaio({
  automationId,
  graph,
  onClose,
}: {
  automationId: string;
  graph: AutomationGraph;
  onClose: () => void;
}): React.JSX.Element {
  const gatilho = gatilhoDoQuadro(
    graph.nodes.map((no) => ({ type: no.kind, data: { type: no.type, config: no.config } })),
  );
  const campos = gatilho === null ? [] : camposDoGatilho(gatilho);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<Estado>({ status: 'form' });

  const ensaiar = async (): Promise<void> => {
    setEstado({ status: 'loading' });
    try {
      const res = await api(`/v1/automations/${encodeURIComponent(automationId)}/simulate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variables: variaveisDeCampos(valores) }),
      });
      if (!res.ok) {
        setEstado({
          status: 'error',
          message:
            res.status === 401 || res.status === 403
              ? 'Ensaiar é de owner ou admin.'
              : 'Não deu para ensaiar. Tente de novo.',
        });
        return;
      }
      setEstado({ status: 'ready', passos: (await res.json()) as PassoEnsaiado[] });
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

        {estado.status === 'loading' && <p className="members-empty">Ensaiando…</p>}

        {estado.status === 'ready' && estado.passos.length === 0 && (
          <p className="members-empty">
            O fluxo não andou: o gatilho não leva a bloco nenhum, ou o quadro está vazio.
          </p>
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

        <div className="modal-actions">
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
