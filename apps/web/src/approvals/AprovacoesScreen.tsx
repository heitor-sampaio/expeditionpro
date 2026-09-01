import { useState } from 'react';
import {
  useIdentityApprovals,
  type DecisionResult,
  type IdentityRequest,
} from './useIdentityApprovals.js';

/**
 * Aprovações de identidade (PC-07) — lista de cartões (cada pedido exige decisão
 * própria). Mostra o de→para (CPF mascarado) e o motivo; aprovar aplica a mudança no
 * cliente, recusar arquiva com nota. Cor é dado: aprovar em accent (ação primária),
 * recusar é secundário com o verbo carregando a intenção. Cinco estados de tela.
 */
export function AprovacoesScreen(): React.JSX.Element {
  const { state, refresh, decide, busy } = useIdentityApprovals();

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1 className="page-title">Alteração de dados</h1>
        <p className="page-meta">
          Nome, CPF, nascimento e contato — pedidos do portal e divergências da inscrição. A mudança
          só vale depois de aprovada aqui.
        </p>
      </div>

      {state.status === 'loading' && <ApprovalsSkeleton />}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar a fila</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && state.requests.length === 0 && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nada aguardando aprovação</span>
            <span className="state-line">
              Pedidos de mudança de nome, CPF, nascimento ou contato aparecem aqui.
            </span>
          </div>
        </div>
      )}

      {state.status === 'ready' && state.requests.length > 0 && (
        <div className="queue-cards">
          {state.requests.map((request) => (
            <ApprovalCard key={request.id} request={request} busy={busy} onDecide={decide} />
          ))}
        </div>
      )}
    </main>
  );
}

function ApprovalCard({
  request,
  busy,
  onDecide,
}: {
  request: IdentityRequest;
  busy: boolean;
  onDecide: (id: string, approve: boolean, note?: string) => Promise<DecisionResult>;
}): React.JSX.Element {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const changes = fieldChanges(request);

  const act = async (promise: Promise<DecisionResult>) => {
    setError(null);
    const result = await promise;
    if (!result.ok) setError(result.message);
  };

  return (
    <article className="qcard">
      <div className="qcard-head">
        <span className="avatar av-pending">{initials(request.customerName)}</span>
        <div className="qcard-id">
          <span className="qcard-name">{request.customerName}</span>
          {request.reason && <span className="qcard-cpf">{request.reason}</span>}
        </div>
      </div>

      <div className="diff">
        {changes.map((change) => (
          <div key={change.label} className="diff-row">
            <span className="diff-label">{change.label}</span>
            <span className="diff-old mono">{change.from ?? '—'}</span>
            <span className="diff-arrow">→</span>
            <span className="diff-new mono">{change.to}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="feedback feedback-error">
          <span className="feedback-dot" />
          <span>{error}</span>
        </div>
      )}

      {rejecting ? (
        <div className="qcard-actions">
          <input
            className="field-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivo da recusa"
          />
          <button
            type="button"
            className="btn btn-secondary btn-danger"
            disabled={busy || note.trim() === ''}
            onClick={() => void act(onDecide(request.id, false, note.trim()))}
          >
            Recusar
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setRejecting(false)}>
            Voltar
          </button>
        </div>
      ) : (
        <div className="qcard-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void act(onDecide(request.id, true))}
          >
            Aprovar
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setRejecting(true)}>
            Recusar
          </button>
        </div>
      )}
    </article>
  );
}

interface FieldChange {
  label: string;
  from: string | null;
  to: string;
}

/** Só os campos que o pedido propõe mudar (requested não-nulo). */
function fieldChanges(request: IdentityRequest): FieldChange[] {
  const changes: FieldChange[] = [];
  if (request.requested.fullName !== null) {
    changes.push({ label: 'Nome', from: request.current.fullName, to: request.requested.fullName });
  }
  if (request.requested.cpf !== null) {
    changes.push({ label: 'CPF', from: request.current.cpf, to: request.requested.cpf });
  }
  if (request.requested.birthDate !== null) {
    changes.push({
      label: 'Nascimento',
      from: request.current.birthDate,
      to: request.requested.birthDate,
    });
  }
  if (request.requested.email !== null) {
    changes.push({ label: 'E-mail', from: request.current.email, to: request.requested.email });
  }
  if (request.requested.phone !== null) {
    changes.push({ label: 'Telefone', from: request.current.phone, to: request.requested.phone });
  }
  return changes;
}

function ApprovalsSkeleton(): React.JSX.Element {
  return (
    <div className="queue-cards" aria-hidden>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="qcard">
          <div className="skel-card">
            <div className="skel-avatar" />
            <div className="skel-bars">
              <div className="skel-bar" />
              <div className="skel-bar short" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}
