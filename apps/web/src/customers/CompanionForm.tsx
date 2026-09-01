import { useState } from 'react';
import { cpfErrorFor, topErrorFor } from './errorMessages.js';
import { useAddCompanion } from './useAddCompanion.js';

/**
 * Form inline para adicionar acompanhante a uma família (CL-03). Só nome, CPF e
 * nascimento são obrigatórios (§3.2). Componente renderiza; o hook chama a API.
 */
export function CompanionForm({
  responsibleId,
  onDone,
  onCancel,
}: {
  responsibleId: string;
  onDone: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [form, setForm] = useState({ fullName: '', cpf: '', birthDate: '' });
  const { state, submit } = useAddCompanion(responsibleId);

  const set =
    (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>): void =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

  const submitting = state.status === 'submitting';
  const ready = form.fullName.trim() !== '' && form.cpf.trim() !== '' && form.birthDate !== '';
  const cpfError = state.status === 'error' ? cpfErrorFor(state.code) : null;
  const topError = state.status === 'error' && cpfError === null ? topErrorFor(state.code) : null;

  const onSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!ready || submitting) return;
    void submit(form).then((ok) => {
      if (ok) onDone();
    });
  };

  return (
    <form className="companion-form" onSubmit={onSubmit} noValidate>
      {topError !== null && (
        <div className="feedback feedback-error form-alert" role="alert">
          <span className="feedback-dot" />
          <span>{topError}</span>
        </div>
      )}
      <div className="form-grid">
        <div className="field field-full">
          <label className="field-label" htmlFor="comp-name">
            Nome do acompanhante
          </label>
          <input
            id="comp-name"
            className="field-input"
            value={form.fullName}
            onChange={set('fullName')}
            placeholder="Nome e sobrenome"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="comp-cpf">
            CPF
          </label>
          <input
            id="comp-cpf"
            className={`field-input is-mono${cpfError !== null ? ' has-error' : ''}`}
            value={form.cpf}
            onChange={set('cpf')}
            placeholder="000.000.000-00"
            inputMode="numeric"
            aria-invalid={cpfError !== null}
          />
          {cpfError !== null && <span className="field-error">{cpfError}</span>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="comp-birth">
            Data de nascimento
          </label>
          <input
            id="comp-birth"
            type="date"
            className="field-input is-mono"
            value={form.birthDate}
            onChange={set('birthDate')}
          />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!ready || submitting}>
          {submitting ? 'Adicionando…' : 'Adicionar acompanhante'}
        </button>
      </div>
    </form>
  );
}
