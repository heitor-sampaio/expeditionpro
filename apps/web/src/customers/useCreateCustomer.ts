import { useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Chama o caso de uso de cadastro pela API. Toda a regra (dígito verificador,
 * unicidade) vive no servidor; o hook só orquestra a chamada e expõe o estado.
 * O componente renderiza a partir daqui — zero lógica de negócio na tela.
 */

export interface CustomerInput {
  fullName: string;
  cpf: string;
  birthDate: string;
  email: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
}

export interface CreatedCustomer {
  id: string;
  fullName: string;
  cpf: string; // mascarado pelo servidor
  birthDate: string;
  email: string | null;
  phone: string | null;
  role: 'responsible' | 'companion';
}

export type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; customer: CreatedCustomer }
  | { status: 'error'; code: string };

export function useCreateCustomer() {
  const [state, setState] = useState<SubmitState>({ status: 'idle' });

  async function submit(input: CustomerInput): Promise<void> {
    setState({ status: 'submitting' });
    try {
      const res = await api('/v1/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: input.fullName,
          cpf: input.cpf,
          birthDate: input.birthDate,
          email: input.email.trim() || undefined,
          phone: input.phone.trim() || undefined,
          address: {
            street: input.street.trim() || undefined,
            number: input.number.trim() || undefined,
            district: input.district.trim() || undefined,
            city: input.city.trim() || undefined,
            state: input.state.trim() || undefined,
            zip: input.cep.trim() || undefined,
          },
        }),
      });
      if (res.status === 201) {
        setState({ status: 'success', customer: (await res.json()) as CreatedCustomer });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setState({ status: 'error', code: body.error ?? 'unknown' });
    } catch {
      setState({ status: 'error', code: 'network' });
    }
  }

  return {
    state,
    submit,
    reset: () => setState({ status: 'idle' }),
  };
}
