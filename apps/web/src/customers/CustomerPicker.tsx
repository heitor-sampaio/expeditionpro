import { useCustomerSearch } from './useCustomerSearch.js';

/**
 * Escolha de um cliente por busca — usada para escolher o responsável de destino
 * (CL-10) e o cadastro duplicado (CL-07). Lista em rádio: uma escolha só, com o
 * alvo de toque da linha clicável. Cinco estados: carregando, erro, vazio, filtro
 * sem resultado e a lista pronta.
 */

interface Props {
  /** `responsibles` só oferece quem é responsável de família (destino de vínculo). */
  readonly mode: 'responsibles' | 'all';
  readonly excludeIds: readonly string[];
  readonly selectedId: string | null;
  readonly onSelect: (customerId: string) => void;
}

interface Option {
  readonly id: string;
  readonly fullName: string;
  readonly cpf: string;
  readonly role: 'responsible' | 'companion';
}

export function CustomerPicker({
  mode,
  excludeIds,
  selectedId,
  onSelect,
}: Props): React.JSX.Element {
  const { query, setQuery, state, refresh } = useCustomerSearch();

  const options: Option[] =
    state.status === 'ready'
      ? state.families
          .flatMap((family) =>
            mode === 'responsibles'
              ? [family.responsible]
              : [family.responsible, ...family.companions],
          )
          .filter((person) => !excludeIds.includes(person.id))
      : [];

  return (
    <>
      <label className="field field-full">
        <span className="field-label">Buscar</span>
        <input
          className="field-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome, CPF ou telefone"
        />
      </label>

      {state.status === 'loading' && (
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
      )}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para buscar</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && options.length === 0 && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">
              {query.trim() === '' ? 'Nenhum outro cadastro' : 'Nenhum cadastro com esse termo'}
            </span>
            <span className="state-line">
              {query.trim() === ''
                ? 'Não há outro cliente para escolher aqui.'
                : 'Ajuste a busca ou limpe o filtro.'}
            </span>
          </div>
          {query.trim() !== '' && (
            <>
              <div className="state-grow" />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setQuery('')}
              >
                Limpar filtro
              </button>
            </>
          )}
        </div>
      )}

      {state.status === 'ready' && options.length > 0 && (
        <div className="enroll-list pick-scroll" role="radiogroup" aria-label="Escolher cadastro">
          {options.map((person) => (
            <label key={person.id} className="check-row">
              <input
                type="radio"
                className="check"
                name="customer-pick"
                checked={selectedId === person.id}
                onChange={() => onSelect(person.id)}
              />
              <span className="check-name">{person.fullName}</span>
              <span className="check-role">{person.cpf}</span>
            </label>
          ))}
        </div>
      )}
    </>
  );
}
