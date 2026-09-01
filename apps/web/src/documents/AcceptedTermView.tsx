import { useEffect } from 'react';
import { useAcceptedTerm } from './useAcceptedTerm.js';

/**
 * "Ver termo aceito" (§5.13 · DOC-08). Carrega o contrato preenchido sob demanda e o
 * mostra num bloco de leitura. HTML já sanitizado por allowlist no servidor. Usado na
 * mesa do grupo (back-office) e na ficha do cliente.
 *
 * Duas modalidades, porque os dois lugares abrem o termo de jeitos diferentes: na ficha
 * do cliente ele é um botão que expande ali mesmo, com "Fechar" próprio; na mesa do grupo
 * quem abre é o modal, e aí o termo já entra carregando (`autoLoad`).
 *
 * `onClose` significa "o contêiner é dono do fechar" — o botão daqui some, porque o modal
 * precisa de um fechar que exista em **todos** os estados, inclusive "sem termo" e "erro",
 * onde não há cabeçalho onde pendurá-lo.
 */
export function AcceptedTermView({
  bookingId,
  autoLoad = false,
  onClose,
}: {
  bookingId: string;
  autoLoad?: boolean;
  onClose?: () => void;
}): React.JSX.Element {
  const { state, load, reset } = useAcceptedTerm(bookingId);

  useEffect(() => {
    if (autoLoad) void load();
  }, [autoLoad, load]);

  if (state.status === 'idle') {
    if (autoLoad) return <p className="members-empty">Carregando termo…</p>;
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
        Ver termo aceito
      </button>
    );
  }

  if (state.status === 'loading') {
    return <p className="members-empty">Carregando termo…</p>;
  }

  if (state.status === 'none') {
    return (
      <div className="feedback feedback-info">
        <span className="feedback-dot" />
        <span>Esta inscrição não tem aceite do Termo registrado.</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="state" role="alert">
        <div className="state-text">
          <span className="state-title">Não deu para carregar o termo</span>
          <span className="state-line is-error">Tente de novo.</span>
        </div>
        <div className="state-grow" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="accepted-term">
      <div className="accepted-term-head">
        <span className="rowpanel-title">
          Termo aceito — versão {state.term.versionNumber} · {formatDateTime(state.term.acceptedAt)}
        </span>
        {onClose === undefined && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>
            Fechar
          </button>
        )}
      </div>
      <div
        className="term-preview"
        // DOC-09: HTML sanitizado por allowlist no servidor.
        dangerouslySetInnerHTML={{ __html: state.term.contentHtml }}
      />
    </div>
  );
}

/** Data/hora do aceite no formato BR, a partir do ISO. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
}
