import { useEffect, useState } from 'react';
import { useCashbackConfig, type CashbackConfig } from '../integrations/useCashbackConfig.js';
import { CuponsSection } from './CuponsSection.js';

/**
 * Promoções — a regra de cashback da empresa (§5.8). Nasce desligada e zerada; ligada,
 * define percentual/valor fixo, base, liberação, validade e teto de resgate. Só render +
 * chamada; o cálculo, o snapshot na inscrição e a expiração são do servidor.
 */
export function PromocoesScreen(): React.JSX.Element {
  const { state, refresh, save, busy } = useCashbackConfig();
  const [draft, setDraft] = useState<CashbackConfig | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (state.status === 'ready') setDraft(state.config);
  }, [state]);

  const set = <K extends keyof CashbackConfig>(field: K, value: CashbackConfig[K]) => {
    setFeedback(null);
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const onSave = async () => {
    if (!draft) return;
    const result = await save(draft);
    setFeedback(
      result.ok ? { ok: true, text: 'Configuração salva.' } : { ok: false, text: result.message },
    );
  };

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1 className="page-title">Promoções</h1>
        <p className="page-meta">
          Cashback e cupons: o que a empresa devolve ao cliente e o que abate da inscrição.
        </p>
      </div>

      <section className="card">
        <div className="panel-head">
          <h2 className="card-title">Cashback</h2>
        </div>

        {state.status === 'loading' && <p className="members-empty">Carregando configuração…</p>}

        {state.status === 'error' && (
          <div className="state" role="alert">
            <div className="state-text">
              <span className="state-title">Não deu para carregar a configuração</span>
              <span className="state-line is-error">Tente de novo.</span>
            </div>
            <div className="state-grow" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
              Tentar de novo
            </button>
          </div>
        )}

        {state.status === 'ready' && draft && (
          <>
            {feedback && (
              <div className={`feedback ${feedback.ok ? 'feedback-go' : 'feedback-error'}`}>
                <span className="feedback-dot" />
                <span>{feedback.text}</span>
              </div>
            )}

            <label className="switch-row">
              <span className="switch-label">
                <span className="rowpanel-title">Módulo de cashback</span>
                <span className="field-help">
                  Desligado, o cashback some da interface, do portal e do cálculo.
                </span>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={draft.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
              />
            </label>

            {draft.enabled && (
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Regra</span>
                  <select
                    className="field-input"
                    value={draft.mode}
                    onChange={(e) => set('mode', e.target.value as CashbackConfig['mode'])}
                  >
                    <option value="percent">Percentual</option>
                    <option value="fixed">Valor fixo</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">
                    {draft.mode === 'percent' ? 'Percentual (%)' : 'Valor fixo (R$)'}
                  </span>
                  {draft.mode === 'percent' ? (
                    <input
                      className="field-input is-mono"
                      inputMode="numeric"
                      value={String(draft.value)}
                      onChange={(e) => set('value', clampInt(e.target.value))}
                    />
                  ) : (
                    <input
                      className="field-input is-mono"
                      inputMode="decimal"
                      value={centsToReais(draft.value)}
                      onChange={(e) => set('value', reaisToCents(e.target.value))}
                    />
                  )}
                </label>
                <label className="field">
                  <span className="field-label">Base do cálculo</span>
                  <select
                    className="field-input"
                    value={draft.base}
                    onChange={(e) => set('base', e.target.value as CashbackConfig['base'])}
                  >
                    <option value="paid">Valor pago</option>
                    <option value="contracted">Valor contratado</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Liberação (dias)</span>
                  <input
                    className="field-input is-mono"
                    inputMode="numeric"
                    value={String(draft.releaseDays)}
                    onChange={(e) => set('releaseDays', clampInt(e.target.value))}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Validade (meses)</span>
                  <input
                    className="field-input is-mono"
                    inputMode="numeric"
                    value={String(draft.validityMonths)}
                    onChange={(e) => set('validityMonths', clampInt(e.target.value))}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Teto de resgate (%)</span>
                  <input
                    className="field-input is-mono"
                    inputMode="numeric"
                    value={String(draft.maxRedemptionPct)}
                    onChange={(e) => set('maxRedemptionPct', clampInt(e.target.value))}
                  />
                </label>
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void onSave()}
              >
                {busy ? 'Salvando…' : 'Salvar configuração'}
              </button>
            </div>
          </>
        )}
      </section>

      <CuponsSection />
    </main>
  );
}

function clampInt(raw: string): number {
  const n = Math.trunc(Number(raw.replace(/\D/g, '')));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2);
}

function reaisToCents(raw: string): number {
  const n = Math.round(Number(raw.replace(',', '.')) * 100);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
