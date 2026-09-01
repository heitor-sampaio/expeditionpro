import { useEffect, useState } from 'react';
import { cpfErrorFor, topErrorFor } from './errorMessages.js';
import { useCep } from './useCep.js';
import {
  useCreateCustomer,
  type CreatedCustomer,
  type CustomerInput,
} from './useCreateCustomer.js';

const EMPTY: CustomerInput = {
  fullName: '',
  cpf: '',
  birthDate: '',
  email: '',
  phone: '',
  cep: '',
  street: '',
  number: '',
  district: '',
  city: '',
  state: '',
};

/**
 * Cadastro de cliente responsável (CL-01). O componente só renderiza e coleta;
 * toda regra (dígito verificador, unicidade, obrigatórios) está no servidor, via
 * o hook. Sem lógica de negócio aqui. `onCreated` avisa quem embuti o form (ex.: a
 * tela de clientes atualiza a busca).
 */
export function CustomerForm({ onCreated }: { onCreated?: () => void } = {}): React.JSX.Element {
  const [form, setForm] = useState<CustomerInput>(EMPTY);
  const { state, submit, reset } = useCreateCustomer();
  const cepLookup = useCep();

  useEffect(() => {
    if (state.status === 'success') onCreated?.();
  }, [state.status, onCreated]);

  const fillFromCep = (): void => {
    void cepLookup.lookup(form.cep).then((result) => {
      if (result) {
        setForm((current) => ({
          ...current,
          street: result.street || current.street,
          district: result.district || current.district,
          city: result.city || current.city,
          state: result.state || current.state,
        }));
      }
    });
  };

  const cepHint =
    cepLookup.state.status === 'loading'
      ? 'Buscando endereço…'
      : cepLookup.state.status === 'error'
        ? 'CEP não encontrado — preencha manualmente.'
        : 'Preenche rua, bairro e cidade automaticamente.';

  const set =
    (field: keyof CustomerInput) =>
    (event: React.ChangeEvent<HTMLInputElement>): void =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

  if (state.status === 'success') {
    return (
      <SuccessCard
        customer={state.customer}
        onAgain={() => {
          setForm(EMPTY);
          reset();
        }}
      />
    );
  }

  const submitting = state.status === 'submitting';
  const ready =
    form.fullName.trim() !== '' &&
    form.cpf.trim() !== '' &&
    form.birthDate !== '' &&
    form.email.trim() !== '' &&
    form.phone.trim() !== '';

  const cpfError = state.status === 'error' ? cpfErrorFor(state.code) : null;
  const topError = state.status === 'error' && !cpfError ? topErrorFor(state.code) : null;

  const onSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!ready || submitting) return;
    void submit(form);
  };

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <h2 className="card-title">Novo cliente</h2>

      {topError !== null && (
        <div className="feedback feedback-error form-alert" role="alert">
          <span className="feedback-dot" />
          <span>{topError}</span>
        </div>
      )}

      <div className="form-grid">
        <div className="field field-full">
          <label className="field-label" htmlFor="fullName">
            Nome completo
          </label>
          <input
            id="fullName"
            className="field-input"
            value={form.fullName}
            onChange={set('fullName')}
            placeholder="Nome e sobrenome"
            autoComplete="name"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="cpf">
            CPF
          </label>
          <input
            id="cpf"
            className={`field-input is-mono${cpfError !== null ? ' has-error' : ''}`}
            value={form.cpf}
            onChange={set('cpf')}
            placeholder="000.000.000-00"
            inputMode="numeric"
            aria-invalid={cpfError !== null}
          />
          {cpfError !== null ? (
            <span className="field-error">{cpfError}</span>
          ) : (
            <span className="field-help">Validado por dígito verificador.</span>
          )}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="birthDate">
            Data de nascimento
          </label>
          <input
            id="birthDate"
            type="date"
            className="field-input is-mono"
            value={form.birthDate}
            onChange={set('birthDate')}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            className="field-input"
            value={form.email}
            onChange={set('email')}
            placeholder="nome@exemplo.com"
            autoComplete="email"
          />
          <span className="field-help">Chave de acesso ao portal.</span>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="phone">
            Telefone / WhatsApp
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            className="field-input is-mono"
            value={form.phone}
            onChange={set('phone')}
            placeholder="(00) 00000-0000"
            autoComplete="tel"
          />
        </div>

        <div className="field field-full">
          <span className="label-caps">Endereço fiscal (opcional)</span>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="cep">
            CEP
          </label>
          <input
            id="cep"
            className="field-input is-mono"
            value={form.cep}
            onChange={set('cep')}
            onBlur={fillFromCep}
            placeholder="00000-000"
            inputMode="numeric"
            autoComplete="postal-code"
          />
          <span className="field-help">{cepHint}</span>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="street">
            Rua
          </label>
          <input
            id="street"
            className="field-input"
            value={form.street}
            onChange={set('street')}
            autoComplete="address-line1"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="number">
            Número
          </label>
          <input
            id="number"
            className="field-input is-mono"
            value={form.number}
            onChange={set('number')}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="district">
            Bairro
          </label>
          <input
            id="district"
            className="field-input"
            value={form.district}
            onChange={set('district')}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="city">
            Cidade
          </label>
          <input id="city" className="field-input" value={form.city} onChange={set('city')} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="state">
            Estado
          </label>
          <input
            id="state"
            className="field-input is-mono"
            value={form.state}
            onChange={set('state')}
            placeholder="UF"
            maxLength={2}
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={!ready || submitting}>
          {submitting ? 'Salvando…' : 'Cadastrar cliente'}
        </button>
      </div>
    </form>
  );
}

function SuccessCard({
  customer,
  onAgain,
}: {
  customer: CreatedCustomer;
  onAgain: () => void;
}): React.JSX.Element {
  return (
    <div className="card">
      <h2 className="card-title">Cliente cadastrado</h2>
      <div className="feedback feedback-info form-alert" role="status">
        <span className="feedback-dot" />
        <span>Cadastro salvo. O CPF aparece mascarado nas listagens.</span>
      </div>
      <div className="result-row">
        <span className="avatar">{initials(customer.fullName)}</span>
        <div className="result-grow">
          <div className="result-name">{customer.fullName}</div>
          <div className="result-sub">{customer.cpf}</div>
        </div>
        <span className="pill pill-neutral">Responsável</span>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onAgain}>
          Cadastrar outro
        </button>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
