import { useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Ações de escrita do portal do cliente (PC-06/PC-07/PC-08). Cada uma chama o servidor,
 * que autoriza pelo escopo de família. Identidade não muda aqui: vira pedido de aprovação.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

export interface AddressInput {
  street?: string;
  number?: string;
  district?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export function usePortalActions() {
  const [busy, setBusy] = useState(false);

  const send = async (
    path: string,
    method: 'POST' | 'PATCH',
    body: unknown,
  ): Promise<ActionResult> => {
    setBusy(true);
    try {
      const res = await api(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg =
          res.status === 401 || res.status === 403
            ? 'Esta ação não é permitida para o seu acesso.'
            : res.status === 409
              ? 'Este CPF já está cadastrado.'
              : `Não deu para salvar (${res.status}).`;
        return { ok: false, message: msg };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: 'Falha de conexão.' };
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    editContact: (
      customerId: string,
      input: {
        email?: string | undefined;
        phone?: string | undefined;
        address?: AddressInput | undefined;
      },
    ) => send(`/v1/portal/customers/${customerId}/contact`, 'PATCH', input),
    addCompanion: (input: { fullName: string; cpf: string; birthDate: string }) =>
      send('/v1/portal/companions', 'POST', input),
    addVehicle: (input: {
      customerId: string;
      plate: string;
      brandId?: string | undefined;
      brandOther?: string | undefined;
      modelId?: string | undefined;
      modelOther?: string | undefined;
    }) => send('/v1/portal/vehicles', 'POST', input),
    requestIdentityChange: (input: {
      customerId: string;
      fullName?: string | undefined;
      cpf?: string | undefined;
      birthDate?: string | undefined;
      reason?: string | undefined;
    }) => send('/v1/portal/identity-change-requests', 'POST', input),
  };
}
