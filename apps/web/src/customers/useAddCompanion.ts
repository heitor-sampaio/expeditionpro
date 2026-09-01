import { useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Adiciona um acompanhante (CL-03) via API. Regras (dois níveis, limite, CPF) no
 * servidor; o hook só chama e expõe o estado. Devolve `true` no sucesso.
 */

export interface CompanionInput {
  fullName: string;
  cpf: string;
  birthDate: string;
}

export type AddCompanionState =
  { status: 'idle' | 'submitting' } | { status: 'error'; code: string };

export function useAddCompanion(responsibleId: string) {
  const [state, setState] = useState<AddCompanionState>({ status: 'idle' });

  async function submit(input: CompanionInput): Promise<boolean> {
    setState({ status: 'submitting' });
    try {
      const res = await api(`/v1/customers/${responsibleId}/companions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (res.status === 201) {
        setState({ status: 'idle' });
        return true;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setState({ status: 'error', code: body.error ?? 'unknown' });
      return false;
    } catch {
      setState({ status: 'error', code: 'network' });
      return false;
    }
  }

  return { state, submit };
}
