import { useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Convite do cliente ao portal (PC-01/PC-02), ação de back-office. Cria a conta no
 * Supabase Auth e devolve o link de acesso (para entrega manual sem SMTP).
 */
export type InviteResult = { ok: true; actionLink: string | null } | { ok: false; message: string };

export function useCustomerInvite() {
  const [busy, setBusy] = useState(false);

  const invite = async (customerId: string): Promise<InviteResult> => {
    setBusy(true);
    try {
      const res = await api(`/v1/customers/${customerId}/portal-invite`, { method: 'POST' });
      if (!res.ok) {
        const msg =
          res.status === 503
            ? 'Convite indisponível: o servidor não tem a Admin API configurada.'
            : res.status === 400
              ? 'Cliente não elegível (precisa ser adulto com e-mail próprio).'
              : res.status === 409
                ? 'Este e-mail já tem conta no sistema.'
                : `Não deu para convidar (${res.status}).`;
        return { ok: false, message: msg };
      }
      const body = (await res.json()) as { actionLink: string | null };
      return { ok: true, actionLink: body.actionLink };
    } catch {
      return { ok: false, message: 'Falha de conexão.' };
    } finally {
      setBusy(false);
    }
  };

  return { busy, invite };
}
