import { useState } from 'react';
import { useTermAcceptance } from './useTermAcceptance.js';
import { useConsents } from './useConsents.js';

/**
 * Gate do Termo no portal (§5.13 · DOC-04). Enquanto o cliente precisa aceitar a versão
 * vigente, bloqueia o portal com o texto do Termo e o aceite; depois libera os filhos.
 * O checkbox obrigatório é o consentimento do contrato — o marketing (DOC-06) é separado
 * e desmarcado por padrão, e entra quando `communication_consents` existir.
 */
export function TermGate({
  customerId,
  children,
}: {
  customerId: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { state, refresh, accept, busy } = useTermAcceptance(customerId);

  if (state.status === 'covered') return <>{children}</>;

  return (
    <div className="page page-wide">
      {state.status === 'loading' && (
        <section className="card" aria-busy>
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </section>
      )}

      {state.status === 'error' && (
        <section className="card">
          <div className="state" role="alert">
            <div className="state-text">
              <span className="state-title">Não deu para carregar o Termo</span>
              <span className="state-line is-error">Tente de novo.</span>
            </div>
            <div className="state-grow" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
              Tentar de novo
            </button>
          </div>
        </section>
      )}

      {state.status === 'required' && (
        <TermAcceptCard
          customerId={customerId}
          versionNumber={state.versionNumber}
          contentHtml={state.contentHtml}
          busy={busy}
          accept={accept}
        />
      )}
    </div>
  );
}

function TermAcceptCard({
  customerId,
  versionNumber,
  contentHtml,
  busy,
  accept,
}: {
  customerId: string;
  versionNumber: number;
  contentHtml: string;
  busy: boolean;
  accept: () => Promise<{ ok: boolean; message?: string }>;
}): React.JSX.Element {
  const [checked, setChecked] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consents = useConsents(customerId);

  const onAccept = async () => {
    setError(null);
    const result = await accept();
    if (!result.ok) {
      setError(result.message ?? 'Falhou ao registrar o aceite.');
      return;
    }
    // DOC-06: o marketing é separado do contrato — só liga se o cliente marcou.
    if (marketing) await consents.setChannel('email', true);
  };

  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">Termo de adesão</h2>
        <span className="pill pill-neutral">versão {versionNumber}</span>
      </div>
      <p className="field-help">
        Para continuar, leia e aceite o Termo de Adesão. O aceite fica registrado com data.
      </p>

      {error && (
        <div className="feedback feedback-error">
          <span className="feedback-dot" />
          <span>{error}</span>
        </div>
      )}

      <div
        className="term-preview term-gate-scroll"
        // DOC-09: HTML sanitizado por allowlist no servidor.
        dangerouslySetInnerHTML={{ __html: contentHtml || '<p>Termo indisponível.</p>' }}
      />

      <label className="check-row">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>Li e aceito o Termo de Adesão</span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={marketing}
          onChange={(e) => setMarketing(e.target.checked)}
        />
        <span>Quero receber convites e novidades por e-mail (opcional)</span>
      </label>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !checked}
          onClick={() => void onAccept()}
        >
          {busy ? 'Registrando…' : 'Aceitar e continuar'}
        </button>
      </div>
    </section>
  );
}
