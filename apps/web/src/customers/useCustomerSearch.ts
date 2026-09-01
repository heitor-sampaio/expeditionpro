import { useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Lista/busca de clientes (CL-04). Sem busca, lista todas as famílias; com busca, casa
 * nome, CPF ou telefone. Ordena por nome ou por criação. Debounced. Toda a resolução da
 * família está no servidor; o hook só orquestra a chamada e expõe o estado para a tela.
 */

export type CustomerSort = 'name' | 'created';

/** Endereço fiscal como o servidor exibe (CEP pontuado); todo campo pode vir nulo. */
export interface AddressDto {
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface CustomerDto {
  id: string;
  fullName: string;
  cpf: string; // mascarado pelo servidor
  birthDate: string;
  email: string | null;
  phone: string | null;
  role: 'responsible' | 'companion';
  address?: AddressDto | undefined;
}

export interface FamilyDto {
  responsible: CustomerDto;
  companions: CustomerDto[];
}

export type SearchState =
  { status: 'loading' } | { status: 'ready'; families: FamilyDto[] } | { status: 'error' };

export function useCustomerSearch() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CustomerSort>('name');
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<SearchState>({ status: 'loading' });

  useEffect(() => {
    const q = query.trim();
    setState({ status: 'loading' });
    const controller = new AbortController();
    // Debounce só quando há texto (evita atraso ao trocar ordenação ou na carga inicial).
    const delay = q === '' ? 0 : 300;
    const timer = setTimeout(() => {
      const url =
        q === ''
          ? `/v1/customers?sort=${sort}`
          : `/v1/customers?sort=${sort}&q=${encodeURIComponent(q)}`;
      api(url, { signal: controller.signal })
        .then((res) => res.json() as Promise<FamilyDto[]>)
        .then((families) => setState({ status: 'ready', families }))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setState({ status: 'error' });
          }
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, sort, reloadKey]);

  return {
    query,
    setQuery,
    sort,
    setSort,
    state,
    refresh: () => setReloadKey((k) => k + 1),
  };
}
