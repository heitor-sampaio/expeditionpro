import type { RecentState } from './useRecentBookings.js';

/**
 * IN-17b — as últimas inscrições já processadas: linhas homogêneas que se comparam, então
 * tabela (a fila acima é cartão porque cada item exige decisão). Cor é dado: confirmada em
 * verde, cancelada em vermelho, pendente em cinza.
 */
export function RecentBookings({
  state,
  onRetry,
}: {
  readonly state: RecentState;
  readonly onRetry: () => void;
}): React.JSX.Element {
  if (state.status === 'loading') {
    return (
      <div className="skeleton" aria-hidden>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skel-card">
            <div className="skel-bars">
              <div className="skel-bar" />
              <div className="skel-bar short" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="state" role="alert">
        <div className="state-text">
          <span className="state-title">Não deu para carregar as inscrições</span>
          <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
        </div>
        <div className="state-grow" />
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (state.rows.length === 0) {
    return (
      <div className="state" role="status">
        <div className="state-text">
          <span className="state-title">Nenhuma inscrição ainda</span>
          <span className="state-line">As inscrições alocadas aparecem aqui.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tbl-wrap">
      <div className="tbl tbl-recent">
        <div className="tbl-row tbl-head">
          <span>Família</span>
          <span>Saída</span>
          <span>Origem</span>
          <span className="col-num">Pessoas</span>
          <span className="col-num">Contratado</span>
          <span>Situação</span>
        </div>
        {state.rows.map((row) => (
          <div
            key={row.bookingId}
            className={`tbl-row${row.status === 'cancelled' ? ' is-cancelled' : ''}`}
          >
            <span className="cell-name">{row.responsibleName}</span>
            <span>{row.groupName}</span>
            <span className="mono source-tag">{sourceLabel(row.source)}</span>
            <span className="col-num mono">{row.participantCount}</span>
            <span className="col-num mono">{brl(row.contractedCents)}</span>
            <span>
              <span className={`pill ${statusPill(row.status)}`}>{statusLabel(row.status)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** De onde veio: o app do cliente, o formulário do site ou a própria equipe. */
function sourceLabel(source: string): string {
  const map: Record<string, string> = { portal: 'app', webhook: 'site', manual: 'equipe' };
  return map[source] ?? source;
}

function statusPill(status: string): string {
  if (status === 'confirmed') return 'pill-go';
  if (status === 'cancelled' || status === 'rejected') return 'pill-no';
  return 'pill-neutral';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    confirmed: 'confirmada',
    pending: 'pendente',
    cancelled: 'cancelada',
    rejected: 'recusada',
  };
  return map[status] ?? status;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
