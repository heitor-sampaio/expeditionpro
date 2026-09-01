import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Fila de aprovação de identidade no back-office (PC-07). Lista os pendentes (de→para,
 * CPF já mascarado no servidor) e decide (aprova aplica a mudança; recusa arquiva com
 * nota). Nenhuma regra aqui — o servidor autoriza (owner/admin) e aplica.
 */

export interface IdentityFieldSet {
  fullName: string | null;
  cpf: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
}

export interface IdentityRequest {
  id: string;
  customerId: string;
  customerName: string;
  reason: string | null;
  current: IdentityFieldSet;
  requested: IdentityFieldSet;
}

export type ApprovalsState =
  { status: 'loading' } | { status: 'ready'; requests: IdentityRequest[] } | { status: 'error' };

export type DecisionResult = { ok: true } | { ok: false; message: string };

export function useIdentityApprovals() {
  const [state, setState] = useState<ApprovalsState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/team/identity-change-requests', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<IdentityRequest[]>;
      })
      .then((requests) => setState({ status: 'ready', requests }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const decide = useCallback(
    async (id: string, approve: boolean, note?: string): Promise<DecisionResult> => {
      setBusy(true);
      try {
        const res = await api(`/v1/team/identity-change-requests/${id}/decision`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ approve, note }),
        });
        if (!res.ok) {
          const msg =
            res.status === 401 || res.status === 403
              ? 'Decidir exige owner ou admin.'
              : `Não deu para decidir (${res.status}).`;
          return { ok: false, message: msg };
        }
        setReloadKey((k) => k + 1);
        return { ok: true };
      } catch {
        return { ok: false, message: 'Falha de conexão.' };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { state, refresh, decide, busy };
}
