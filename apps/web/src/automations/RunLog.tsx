import { useAutomationRuns, type AutomationRun, type RunStep } from './useAutomationRuns.js';
import { blockLabel } from './blocks.js';

/**
 * AU-06 — o log de execuções.
 *
 * A pergunta que esta tela responde é sempre a mesma, e é sempre feita depois que algo deu
 * errado: *por que essa mensagem foi enviada para esse cliente?* Por isso a linha mostra o
 * estado e o motivo da falha antes de qualquer outra coisa, e o passo a passo abre por cima.
 *
 * **Nenhuma cor semântica aqui.** Uma execução que terminou não é "pago", e uma que falhou não
 * é "cancelada" — neste sistema verde e vermelho são dinheiro. O estado da execução é
 * informação de operação, e vai de cinza.
 */
export function RunLog({ automationId }: { automationId: string }): React.JSX.Element {
  const { state, aberta, abrir, fechar, refresh } = useAutomationRuns(automationId);

  return (
    <section className="auto-runs">
      <div className="toolbar auto-runs-head">
        <span className="inbox-side-title">Execuções recentes</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
          Atualizar
        </button>
      </div>

      {state.status === 'loading' && (
        <div className="skeleton" aria-hidden>
          <div className="skel-card">
            <span className="skel-bars">
              <span className="skel-bar" />
              <span className="skel-bar short" />
            </span>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar as execuções</span>
            <span className="state-line is-error">Tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'forbidden' && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">Sem acesso ao log</span>
            <span className="state-line">O log é da equipe. Peça a um owner ou admin.</span>
          </div>
          <div className="state-grow" />
        </div>
      )}

      {state.status === 'ready' && state.runs.length === 0 && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">Ainda não rodou</span>
            <span className="state-line">
              Quando o gatilho acontecer, cada passagem aparece aqui com o que ela decidiu.
            </span>
          </div>
          <div className="state-grow" />
        </div>
      )}

      {state.status === 'ready' &&
        state.runs.map((run) => (
          <button
            key={run.id}
            type="button"
            className="auto-run"
            onClick={() => void abrir(run.id)}
          >
            <span className="pill pill-neutral">{ESTADO[run.status]}</span>
            <span className="auto-run-when">{quando(run.createdAt)}</span>
            <span className="cell-sub auto-run-why">
              {run.lastError ?? `${String(run.stepsTaken)} passos`}
            </span>
          </button>
        ))}

      {aberta && <PassoAPasso run={aberta} onClose={fechar} />}
    </section>
  );
}

function PassoAPasso({
  run,
  onClose,
}: {
  run: AutomationRun;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Passo a passo">
      <div className="modal modal-lg">
        <h2 className="modal-title">O que aconteceu nesta execução</h2>
        <p className="modal-sub">
          {ESTADO[run.status]} · {quando(run.createdAt)}
          {run.lastError && ` · ${run.lastError}`}
        </p>

        <div className="auto-steps">
          {(run.steps ?? []).map((step) => (
            <div key={step.id} className="auto-step">
              <span className="auto-step-node">{step.nodeId}</span>
              <span className="cell-name">{rotuloDoPasso(step)}</span>
              <span className="cell-sub">{detalhe(step)}</span>
            </div>
          ))}
          {(run.steps ?? []).length === 0 && (
            <p className="field-help">Esta execução não chegou a percorrer nenhum bloco.</p>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/** O que o passo fez, em português. É a linha que a pessoa lê primeiro. */
function rotuloDoPasso(step: RunStep): string {
  if (step.kind === 'condition')
    return step.outcome === 'true' ? 'Seguiu pelo sim' : 'Seguiu pelo não';
  if (step.kind === 'trigger') return 'Disparou';
  if (step.kind === 'delay') return 'Entrou em espera';
  if (step.kind === 'end') return 'Encerrou';
  if (step.kind === 'setVariable') return 'Definiu variável';
  return step.outcome === 'erro' ? 'Falhou' : blockLabel(step.nodeId);
}

/** O detalhe cru, que é onde mora a resposta do provedor e o motivo do erro. */
function detalhe(step: RunStep): string {
  const chaves = Object.entries(step.detail);
  if (chaves.length === 0) return '—';
  return chaves.map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
}

const ESTADO: Record<AutomationRun['status'], string> = {
  pending: 'Na fila',
  waiting: 'Esperando',
  done: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

/** Data e hora curtas, no fuso de quem está olhando. */
function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
