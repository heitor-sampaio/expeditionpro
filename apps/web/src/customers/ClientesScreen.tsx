import { useState } from 'react';
import { CustomerForm } from './CustomerForm.js';
import { FamilyCard } from './FamilyCard.js';
import { useCustomerSearch } from './useCustomerSearch.js';

/**
 * Clientes e famílias (CL-03 / CL-04). Lista todas as famílias e busca por nome, CPF ou
 * telefone resolvendo a família inteira, com ordenação por nome ou criação e adicionar
 * acompanhante no fluxo. Implementa os estados de tela: carregando, erro, vazio, busca sem
 * resultado e resultados. Toda regra vive no servidor; aqui é só composição e renderização.
 */

const SORTS: readonly { id: 'name' | 'created'; label: string }[] = [
  { id: 'name', label: 'Nome' },
  { id: 'created', label: 'Mais recentes' },
];

export function ClientesScreen({
  onOpenFile,
}: {
  onOpenFile: (customerId: string) => void;
}): React.JSX.Element {
  const { query, setQuery, sort, setSort, state, refresh } = useCustomerSearch();
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <header className="page-header">
        <div className="toolbar">
          <div>
            <h1 className="page-title">Clientes</h1>
            <p className="page-meta">Todos os clientes. Busca por nome, CPF ou telefone.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? 'Fechar cadastro' : 'Cadastrar cliente'}
          </button>
        </div>
      </header>

      {creating && (
        <div className="card">
          <div className="panel-head">
            <h2 className="card-title">Novo cliente responsável</h2>
          </div>
          <CustomerForm onCreated={refresh} />
        </div>
      )}

      <div className="list-controls">
        <div className="searchbar">
          <input
            className="field-input is-mono"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, CPF ou telefone"
            aria-label="Buscar clientes"
            inputMode="search"
          />
        </div>
        <div className="sort-group" role="group" aria-label="Ordenar clientes">
          <span className="sort-label">Ordenar</span>
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip${sort === s.id ? ' is-active' : ''}`}
              aria-pressed={sort === s.id}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Results
        state={state}
        query={query}
        onClear={() => setQuery('')}
        onRetry={refresh}
        onChanged={refresh}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}

function Results({
  state,
  query,
  onClear,
  onRetry,
  onChanged,
  onOpenFile,
}: {
  state: ReturnType<typeof useCustomerSearch>['state'];
  query: string;
  onClear: () => void;
  onRetry: () => void;
  onChanged: () => void;
  onOpenFile: (customerId: string) => void;
}): React.JSX.Element {
  if (state.status === 'loading') {
    return (
      <div className="skeleton" aria-busy="true">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="state">
        <div className="state-text state-grow">
          <span className="state-title">Não foi possível buscar</span>
          <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (state.families.length === 0) {
    if (query.trim() === '') {
      return (
        <div className="state">
          <div className="state-text state-grow">
            <span className="state-title">Nenhum cliente ainda</span>
            <span className="state-line">
              Cadastre o primeiro cliente responsável para começar.
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="state">
        <div className="state-text state-grow">
          <span className="state-title">Nenhum cliente encontrado</span>
          <span className="state-line">Nada bate com “{query}”. Ajuste a busca.</span>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
          Limpar busca
        </button>
      </div>
    );
  }

  return (
    <div className="families">
      {state.families.map((family) => (
        <FamilyCard
          key={family.responsible.id}
          family={family}
          onChanged={onChanged}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}

function SkeletonCard(): React.JSX.Element {
  return (
    <div className="skel-card" aria-hidden>
      <span className="skel-avatar" />
      <span className="skel-bars">
        <span className="skel-bar" />
        <span className="skel-bar short" />
      </span>
    </div>
  );
}
