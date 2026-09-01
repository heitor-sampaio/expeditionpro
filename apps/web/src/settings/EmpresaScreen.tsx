import { useEffect, useRef, useState } from 'react';
import { useCompany } from './useCompany.js';
import { fileToLogoDataUri, LogoFileError } from './logoFile.js';

/**
 * CF-01 — a identidade da empresa: razão social, CNPJ e logo. É o que sai no cabeçalho
 * da roomlist (GR-15) e na marca da navegação (CF-02).
 *
 * Só render e chamada: validação de CNPJ e de formato da imagem é do servidor; a
 * conversão para PNG acontece no navegador porque é onde o arquivo está.
 */
export function EmpresaScreen(): React.JSX.Element {
  const { state, busy, refresh, save } = useCompany();
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status !== 'ready') return;
    setName(state.company.name);
    setCnpj(state.company.cnpj ?? '');
    setLogo(state.company.logo);
  }, [state]);

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setFeedback(null);
    try {
      setLogo(await fileToLogoDataUri(file));
    } catch (error) {
      setFeedback({
        ok: false,
        text: error instanceof LogoFileError ? error.message : 'Não foi possível ler a imagem.',
      });
    }
  };

  const onSave = async () => {
    const result = await save({
      name,
      cnpj: cnpj.trim() === '' ? null : cnpj,
      logo,
    });
    setFeedback(
      result.ok ? { ok: true, text: 'Dados salvos.' } : { ok: false, text: result.message },
    );
  };

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1 className="page-title">Empresa</h1>
        <p className="page-meta">Identidade que sai nos documentos e na marca do sistema.</p>
      </div>

      <section className="card">
        <div className="panel-head">
          <h2 className="card-title">Identidade</h2>
        </div>

        {state.status === 'loading' && <p className="members-empty">Carregando dados…</p>}

        {state.status === 'error' && (
          <div className="state" role="alert">
            <div className="state-text">
              <span className="state-title">Não deu para carregar os dados da empresa</span>
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
              <span className="state-title">Sem acesso aos dados da empresa</span>
              <span className="state-line">Peça a um owner ou admin do tenant.</span>
            </div>
            <div className="state-grow" />
            <button type="button" className="btn btn-secondary btn-sm" disabled>
              Salvar
            </button>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            {feedback && (
              <div className={`feedback ${feedback.ok ? 'feedback-go' : 'feedback-error'}`}>
                <span className="feedback-dot" />
                <span>{feedback.text}</span>
              </div>
            )}

            <div className="logo-row">
              <div className="logo-preview">
                {logo ? (
                  <img src={logo} alt="Logo da empresa" />
                ) : (
                  <span className="logo-empty">sem logo</span>
                )}
              </div>
              <div className="logo-actions">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="visually-hidden"
                  onChange={(event) => void pickLogo(event.target.files?.[0])}
                />
                <div className="form-actions-left">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileInput.current?.click()}
                  >
                    Escolher imagem
                  </button>
                  {logo && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setLogo(null)}
                    >
                      Remover logo
                    </button>
                  )}
                </div>
                <span className="field-help">
                  PNG ou JPG. Aparece no cabeçalho da roomlist e na marca do menu.
                </span>
              </div>
            </div>

            <div className="form-grid">
              <label className="field">
                <span className="field-label">Razão social</span>
                <input
                  className="field-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">CNPJ</span>
                <input
                  className="field-input is-mono"
                  inputMode="numeric"
                  value={cnpj}
                  onChange={(event) => setCnpj(event.target.value)}
                  placeholder="00.000.000/0001-00"
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || name.trim() === ''}
                onClick={() => void onSave()}
              >
                {busy ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
