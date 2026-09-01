import { useCep } from './useCep.js';

/**
 * Endereço fiscal (CL-02) em campos controlados: CEP com autocomplete ViaCEP no blur e
 * preenchimento manual como fallback — endereço é opcional e nunca bloqueia o salvamento.
 * Só coleta; a normalização (CEP só dígitos, UF em caixa alta) é do servidor.
 */

export interface AddressDraft {
  zip: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
}

export const EMPTY_ADDRESS_DRAFT: AddressDraft = {
  zip: '',
  street: '',
  number: '',
  district: '',
  city: '',
  state: '',
};

export function AddressFields({
  value,
  onChange,
}: {
  readonly value: AddressDraft;
  readonly onChange: (next: AddressDraft) => void;
}): React.JSX.Element {
  const cepLookup = useCep();

  const set = (field: keyof AddressDraft) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: event.target.value });

  const fillFromCep = (): void => {
    void cepLookup.lookup(value.zip).then((result) => {
      if (result) {
        onChange({
          ...value,
          street: result.street || value.street,
          district: result.district || value.district,
          city: result.city || value.city,
          state: result.state || value.state,
        });
      }
    });
  };

  const cepHint =
    cepLookup.state.status === 'loading'
      ? 'Buscando endereço…'
      : cepLookup.state.status === 'error'
        ? 'CEP não encontrado — preencha manualmente.'
        : 'Preenche rua, bairro e cidade automaticamente.';

  return (
    <div className="form-grid">
      <label className="field">
        <span className="field-label">CEP</span>
        <input
          className="field-input is-mono"
          value={value.zip}
          onChange={set('zip')}
          onBlur={fillFromCep}
          placeholder="00000-000"
          inputMode="numeric"
          autoComplete="postal-code"
        />
        <span className="field-help">{cepHint}</span>
      </label>

      <label className="field field-wide">
        <span className="field-label">Rua</span>
        <input
          className="field-input"
          value={value.street}
          onChange={set('street')}
          autoComplete="address-line1"
        />
      </label>

      <label className="field">
        <span className="field-label">Número</span>
        <input className="field-input is-mono" value={value.number} onChange={set('number')} />
      </label>

      <label className="field">
        <span className="field-label">Bairro</span>
        <input className="field-input" value={value.district} onChange={set('district')} />
      </label>

      <label className="field">
        <span className="field-label">Cidade</span>
        <input className="field-input" value={value.city} onChange={set('city')} />
      </label>

      <label className="field">
        <span className="field-label">Estado</span>
        <input
          className="field-input is-mono"
          value={value.state}
          onChange={set('state')}
          placeholder="UF"
          maxLength={2}
        />
      </label>
    </div>
  );
}
