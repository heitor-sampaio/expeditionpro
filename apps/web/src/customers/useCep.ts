import { useState } from 'react';
import { isValidCep, normalizeCep } from '@expedition/domain';

/**
 * Autocomplete de endereço por CEP (CL-02) via ViaCEP, com cache e fallback manual:
 * se a API falha ou o CEP não existe, o estado vira `error` e a tela deixa o usuário
 * preencher à mão. Sem bloquear nada — endereço é opcional.
 */

export interface CepResult {
  street: string;
  district: string;
  city: string;
  state: string;
}

export type CepState = { status: 'idle' | 'loading' | 'error' } | { status: 'found' };

interface ViaCepResponse {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

const cache = new Map<string, CepResult>();

export function useCep() {
  const [state, setState] = useState<CepState>({ status: 'idle' });

  async function lookup(rawCep: string): Promise<CepResult | null> {
    const cep = normalizeCep(rawCep);
    if (!isValidCep(cep)) {
      setState({ status: 'idle' });
      return null;
    }
    const cached = cache.get(cep);
    if (cached) {
      setState({ status: 'found' });
      return cached;
    }
    setState({ status: 'loading' });
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = (await res.json()) as ViaCepResponse;
      if (data.erro === true) {
        setState({ status: 'error' });
        return null;
      }
      const result: CepResult = {
        street: data.logradouro ?? '',
        district: data.bairro ?? '',
        city: data.localidade ?? '',
        state: data.uf ?? '',
      };
      cache.set(cep, result);
      setState({ status: 'found' });
      return result;
    } catch {
      setState({ status: 'error' });
      return null;
    }
  }

  return { state, lookup };
}
