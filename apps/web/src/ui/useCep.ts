import { useState } from 'react';
import { isValidCep, normalizeCep } from '@expedition/domain';
import { API_BASE, apiUrl } from '../auth/apiUrl.js';

/**
 * Autocomplete de endereço por CEP (CL-02), pela **nossa** API.
 *
 * Ele chamava o ViaCEP direto do navegador, e isso nunca funcionou em produção: a CSP do front
 * não lista `viacep.com.br` em `connect-src`, o navegador bloqueava, e o `catch` aqui embaixo
 * transformava o bloqueio em "CEP não encontrado — preencha manualmente". Exatamente o que se
 * vê quando um CEP não existe, e por isso ninguém notou.
 *
 * Agora quem conversa com o ViaCEP é o servidor. Além de destravar, é o que permite usar este
 * hook na página pública de inscrição (IN-25) sem dar a um terceiro o IP de todo interessado.
 *
 * **Sem `Authorization`, de propósito**: a rota é pública e este hook atende as duas
 * audiências. Passar pelo `api.ts` arrastaria o `signOut` que ele dispara num 401 — e um
 * visitante anônimo não tem sessão para perder.
 *
 * O cache continua de processo: dentro de um formulário, o mesmo CEP é digitado e reperdido o
 * tempo todo enquanto a pessoa corrige o número.
 */

export interface CepResult {
  street: string;
  district: string;
  city: string;
  state: string;
}

export type CepState = { status: 'idle' | 'loading' | 'error' } | { status: 'found' };

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
      const res = await fetch(apiUrl(API_BASE, `/v1/public/cep/${cep}`));
      // 404 é CEP inexistente; qualquer outro não-ok é o serviço fora. Para quem digitou, as
      // duas coisas terminam no mesmo lugar: preencha à mão.
      if (!res.ok) {
        setState({ status: 'error' });
        return null;
      }
      const result = (await res.json()) as CepResult;
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
