import { useState } from 'react';
import { api } from '../auth/api.js';

/** Salva o veículo do cliente (CL-05). Regras no servidor; o hook orquestra. */

export interface VehiclePayload {
  brandId?: string;
  brandOther?: string;
  modelId?: string;
  modelOther?: string;
  plate: string;
}

export type SaveVehicleState =
  { status: 'idle' | 'submitting' | 'success' } | { status: 'error'; code: string };

export function useSaveVehicle(customerId: string) {
  const [state, setState] = useState<SaveVehicleState>({ status: 'idle' });

  async function submit(payload: VehiclePayload): Promise<boolean> {
    setState({ status: 'submitting' });
    try {
      const res = await api(`/v1/customers/${customerId}/vehicles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 201) {
        setState({ status: 'success' });
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

  return { state, submit, reset: () => setState({ status: 'idle' }) };
}
